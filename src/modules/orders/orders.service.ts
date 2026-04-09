type PgError = {
  code?: string;
};

function isPgError(error: unknown): error is PgError {
  return typeof error === 'object' && error !== null && 'code' in error;
}
import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  RabbitService,
  OrdersProcessMessage,
} from '../../rabbit/rabbit.service';
import { DataSource, In } from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Product } from '../products/product.entity';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/http-exception';

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
  constructor(
    private readonly dataSource: DataSource,
    private readonly rabbit: RabbitService,
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

  async createOrder(dto: CreateOrderDto, idempotencyKey: string) {
    if (!idempotencyKey) {
      throw new BadRequestError('Idempotency-Key header is required');
    }

    if (!dto.userId) {
      throw new BadRequestError('userId is required');
    }

    if (!dto.items?.length) {
      throw new BadRequestError('items must be a non-empty array');
    }

    for (const it of dto.items) {
      if (!it.productId) {
        throw new BadRequestError('productId is required', { item: it });
      }

      if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
        throw new BadRequestError('quantity must be positive int', {
          item: it,
        });
      }
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // 1) idempotency
      const existing = await qr.manager.findOne(Order, {
        where: { userId: dto.userId, idempotencyKey },
        relations: { items: false },
      });

      if (existing) {
        await qr.commitTransaction();
        return { reused: true, order: existing };
      }

      // 2) validate products exist
      const productIds = dto.items.map((i) => i.productId);
      const products = await qr.manager.findBy(Product, { id: In(productIds) });

      if (products.length !== new Set(productIds).size) {
        const found = new Set(products.map((p) => p.id));
        const missing = productIds.filter((id) => !found.has(id));
        throw new NotFoundError('Some products not found', { missing });
      }

      const byId = new Map(products.map((p) => [p.id, p]));

      // 3) create order
      const order = qr.manager.create(Order, {
        userId: dto.userId,
        idempotencyKey,
        status: 'pending',
      });

      await qr.manager.save(order);

      // 4) create items
      for (const it of dto.items) {
        const p = byId.get(it.productId)!;

        const item = qr.manager.create(OrderItem, {
          orderId: order.id,
          productId: p.id,
          quantity: it.quantity,
          priceAtPurchase: p.price,
        });

        await qr.manager.save(item);
      }

      await qr.commitTransaction();

      // 5) publish to RabbitMQ AFTER commit
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

      return { reused: false, order, messageId };
    } catch (e: unknown) {
      await qr.rollbackTransaction();

      if (isPgError(e) && e.code === '23505') {
        const order = await this.dataSource.getRepository(Order).findOne({
          where: { userId: dto.userId, idempotencyKey },
        });

        if (order) {
          return { reused: true, order };
        }

        throw new ConflictError('Duplicate idempotency key');
      }

      throw e;
    } finally {
      await qr.release();
    }
  }
}
