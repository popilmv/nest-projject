import { Injectable, Logger } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import { v4 as uuidv4 } from 'uuid';
import { DataSource } from 'typeorm';
import type { RequestUser } from '../../common/auth/user.types';
import {
  BadRequestError,
  ConflictError,
  GatewayTimeoutError,
  NotFoundError,
  ServiceUnavailableError,
} from '../../common/errors/http-exception';
import {
  OrdersProcessMessage,
  RabbitService,
} from '../../rabbit/rabbit.service';
import { PaymentsClient } from '../payments-client/payments.client';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { buildOrderPlan } from './order-policy';

type PgError = {
  code?: string;
};

function isPgError(error: unknown): error is PgError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

type FindOrdersArgs = {
  filter?: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  pagination?: {
    limit?: number;
    offset?: number;
  };
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly rabbit: RabbitService,
    private readonly paymentsClient: PaymentsClient,
  ) {}

  /**
   * Returns orders with items. Product for each item is resolved in GraphQL via DataLoader.
   * NOTE: this method is used by GraphQL resolver to keep resolver thin.
   */
  async findOrders(args: FindOrdersArgs): Promise<Order[]> {
    const limit = Math.min(Math.max(args.pagination?.limit ?? 20, 1), 100);
    const offset = Math.max(args.pagination?.offset ?? 0, 0);

    const qb = this.dataSource
      .getRepository(Order)
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.items', 'i')
      .orderBy('o.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (args.filter?.status) {
      qb.andWhere('o.status = :status', { status: args.filter.status });
    }

    if (args.filter?.dateFrom) {
      qb.andWhere('o.createdAt >= :dateFrom', {
        dateFrom: new Date(args.filter.dateFrom),
      });
    }

    if (args.filter?.dateTo) {
      qb.andWhere('o.createdAt <= :dateTo', {
        dateTo: new Date(args.filter.dateTo),
      });
    }

    return qb.getMany();
  }

  async getOrder(actor: RequestUser, orderId: string): Promise<Order> {
    const order = await this.dataSource.getRepository(Order).findOne({
      where:
        actor.role === 'admin'
          ? { id: orderId }
          : { id: orderId, userId: actor.id },
      relations: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found or access denied', { orderId });
    }

    this.logger.log({
      event: 'order_read',
      orderId: order.id,
      userId: actor.id,
      role: actor.role,
      status: order.status,
    });

    return order;
  }

  async createOrder(
    actor: RequestUser,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestError('Idempotency-Key header is required');
    }

    if (!dto.items?.length) {
      throw new BadRequestError('items must be a non-empty array');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const user = await qr.manager.findOne(User, {
        where: { id: actor.id },
      });

      if (!user) {
        throw new NotFoundError('Authenticated user was not found', {
          userId: actor.id,
        });
      }

      const existing = await qr.manager.findOne(Order, {
        where: { userId: actor.id, idempotencyKey },
        relations: { items: true },
      });

      if (existing) {
        await qr.commitTransaction();
        this.logger.log({
          event: 'order_idempotency_reused',
          orderId: existing.id,
          userId: actor.id,
        });

        return {
          reused: true,
          order: existing,
          payment:
            existing.paymentId && existing.paymentStatus
              ? {
                  payment_id: existing.paymentId,
                  status: existing.paymentStatus,
                }
              : null,
        };
      }

      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await qr.manager
        .createQueryBuilder(Product, 'product')
        .where('product.id IN (:...productIds)', { productIds })
        .setLock('pessimistic_write')
        .getMany();

      const plan = buildOrderPlan(products, dto.items);
      const productsById = new Map(
        products.map((product) => [product.id, product]),
      );

      for (const [productId, requestedQuantity] of plan.quantityByProductId) {
        const product = productsById.get(productId)!;
        product.stock -= requestedQuantity;
        await qr.manager.save(Product, product);
      }

      const order = qr.manager.create(Order, {
        userId: actor.id,
        idempotencyKey,
        status: 'pending',
      });

      await qr.manager.save(order);

      for (const itemInput of dto.items) {
        const product = productsById.get(itemInput.productId)!;
        const item = qr.manager.create(OrderItem, {
          order,
          product,
          quantity: itemInput.quantity,
          priceAtPurchase: product.price,
        });

        await qr.manager.save(item);
      }

      await qr.commitTransaction();
      this.logger.log({
        event: 'order_created',
        orderId: order.id,
        userId: actor.id,
        amountCents: plan.amountCents,
        status: order.status,
      });

      let payment: { payment_id: string; status: string };
      try {
        payment = await this.paymentsClient.authorize({
          orderId: order.id,
          amountCents: plan.amountCents,
          currency: process.env.PAYMENTS_CURRENCY ?? 'USD',
          idempotencyKey,
        });
      } catch (error: unknown) {
        await this.failOrderAndReleaseStock(order.id);
        this.logger.error({
          event: 'order_payment_failed',
          orderId: order.id,
          userId: actor.id,
        });
        this.handlePaymentsRpcError(error);
      }

      await this.dataSource.getRepository(Order).update(order.id, {
        paymentId: payment.payment_id,
        paymentStatus: payment.status,
      });

      order.paymentId = payment.payment_id;
      order.paymentStatus = payment.status;

      const messageId = uuidv4();
      const msg: OrdersProcessMessage = {
        messageId,
        orderId: order.id,
        createdAt: new Date().toISOString(),
        attempt: 0,
        correlationId: messageId,
        producer: 'orders-api',
        eventName: 'orders.process',
      };

      this.rabbit.publishJson(this.rabbit.rkProcess, msg, {
        messageId,
        correlationId: msg.correlationId,
      });

      this.logger.log({
        event: 'order_processing_enqueued',
        orderId: order.id,
        messageId,
        routingKey: this.rabbit.rkProcess,
      });

      return { reused: false, order, payment, messageId };
    } catch (e: unknown) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }

      if (isPgError(e) && e.code === '23505') {
        const order = await this.dataSource.getRepository(Order).findOne({
          where: { userId: actor.id, idempotencyKey },
          relations: { items: true },
        });

        if (order) {
          return {
            reused: true,
            order,
            payment:
              order.paymentId && order.paymentStatus
                ? {
                    payment_id: order.paymentId,
                    status: order.paymentStatus,
                  }
                : null,
          };
        }

        throw new ConflictError('Duplicate idempotency key');
      }

      throw e;
    } finally {
      await qr.release();
    }
  }

  private async failOrderAndReleaseStock(orderId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: {
          items: {
            product: true,
          },
        },
      });

      if (!order || order.status === 'failed') {
        return;
      }

      order.status = 'failed';
      await manager.save(Order, order);

      for (const item of order.items ?? []) {
        const productId = item.product?.id ?? item.productId;
        if (productId) {
          await manager.increment(
            Product,
            { id: productId },
            'stock',
            item.quantity,
          );
        }
      }
    });
  }

  private handlePaymentsRpcError(error: unknown): never {
    if (this.isGrpcServiceError(error)) {
      if (error.code === grpc.status.DEADLINE_EXCEEDED) {
        throw new GatewayTimeoutError('Payments authorization timed out', {
          service: 'payments',
          transport: 'grpc',
        });
      }

      throw new ServiceUnavailableError('Payments authorization failed', {
        service: 'payments',
        transport: 'grpc',
        rpcCode: error.code,
      });
    }

    throw new ServiceUnavailableError('Payments authorization failed', {
      service: 'payments',
      transport: 'grpc',
    });
  }

  private isGrpcServiceError(error: unknown): error is grpc.ServiceError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'number'
    );
  }
}
