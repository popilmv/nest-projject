import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as amqp from 'amqplib';
import { RabbitService, OrdersProcessMessage } from '../rabbit/rabbit.service';
import { ProcessedMessage } from '../modules/orders/processed-message.entity';
import { Order } from '../modules/orders/order.entity';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type PgError = { code?: string };

function isPgError(error: unknown): error is PgError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

@Injectable()
export class OrdersWorker implements OnModuleInit {
  private readonly logger = new Logger(OrdersWorker.name);

  private readonly maxAttempts = Number(process.env.ORDERS_MAX_ATTEMPTS ?? 3);

  constructor(
    private readonly rabbit: RabbitService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.rabbit.consume(this.rabbit.processQueue, (msg) =>
      this.handle(msg),
    );
    this.logger.log(
      `Consuming ${this.rabbit.processQueue} (maxAttempts=${this.maxAttempts})`,
    );
  }

  private parse(msg: amqp.ConsumeMessage): OrdersProcessMessage {
    const raw = msg.content.toString('utf-8');
    return JSON.parse(raw) as OrdersProcessMessage;
  }

  private async handle(msg: amqp.ConsumeMessage): Promise<void> {
    const chAck = () => this.rabbit.ack(msg);
    const payload = this.parse(msg);

    const { messageId, orderId, attempt } = payload;

    const logBase = {
      messageId,
      orderId,
      attempt,
      redelivered: msg.fields.redelivered,
    };

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const pm = qr.manager.create(ProcessedMessage, {
        messageId,
        orderId,
        handler: 'orders-worker',
      });

      await qr.manager.insert(ProcessedMessage, pm);

      const order = await qr.manager
        .createQueryBuilder(Order, 'o')
        .where('o.id = :id', { id: orderId })
        .setLock('pessimistic_write')
        .getOne();

      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      if (order.status === 'processed') {
        await qr.commitTransaction();
        this.logger.log({
          ...logBase,
          result: 'success',
          note: 'already processed',
        });
        chAck();
        return;
      }

      await sleep(200 + Math.floor(Math.random() * 300));

      const failProb = Number(process.env.ORDERS_FAIL_PROB ?? 0);
      if (failProb > 0 && Math.random() < failProb) {
        throw new Error('Simulated worker failure (ORDERS_FAIL_PROB)');
      }

      order.status = 'processed';
      order.processedAt = new Date();
      await qr.manager.save(order);

      await qr.commitTransaction();
      this.logger.log({ ...logBase, result: 'success' });
      chAck();
    } catch (error: unknown) {
      if (isPgError(error) && error.code === '23505') {
        await qr.rollbackTransaction();
        this.logger.warn({
          ...logBase,
          result: 'success',
          note: 'duplicate messageId',
        });
        chAck();
        return;
      }

      await qr.rollbackTransaction();

      const reason = getErrorMessage(error);

      if (attempt < this.maxAttempts) {
        const next: OrdersProcessMessage = { ...payload, attempt: attempt + 1 };
        this.rabbit.publishJson(this.rabbit.rkRetry, next, {
          messageId: next.messageId,
          correlationId: payload.correlationId ?? payload.messageId,
        });

        this.logger.warn({ ...logBase, result: 'retry', reason });
        chAck();
        return;
      }

      this.rabbit.publishJson(this.rabbit.rkDlq, payload, {
        messageId: payload.messageId,
        correlationId: payload.correlationId ?? payload.messageId,
      });
      this.logger.error({ ...logBase, result: 'dlq', reason });
      chAck();
    } finally {
      await qr.release();
    }
  }
}
