import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as amqp from 'amqplib';
import { RabbitService, OrdersProcessMessage } from '../rabbit/rabbit.service';
import { ProcessedMessage } from '../modules/orders/processed-message.entity';
import { Order } from '../modules/orders/order.entity';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class OrdersWorker implements OnModuleInit {
  private readonly logger = new Logger(OrdersWorker.name);

  private readonly maxAttempts = Number(process.env.ORDERS_MAX_ATTEMPTS ?? 3);

  constructor(
    private readonly rabbit: RabbitService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.rabbit.consume(this.rabbit.processQueue, (msg) => this.handle(msg));
    this.logger.log(`Consuming ${this.rabbit.processQueue} (maxAttempts=${this.maxAttempts})`);
  }

  private parse(msg: amqp.ConsumeMessage): OrdersProcessMessage {
    const raw = msg.content.toString('utf-8');
    return JSON.parse(raw);
  }

  private async handle(msg: amqp.ConsumeMessage) {
    const chAck = () => this.rabbit.ack(msg);
    const payload = this.parse(msg);

    const { messageId, orderId, attempt } = payload;

    const logBase = { messageId, orderId, attempt, redelivered: msg.fields.redelivered };

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Idempotency guard
      const pm = qr.manager.create(ProcessedMessage, {
        messageId,
        orderId,
        handler: 'orders-worker',
      });

      await qr.manager.insert(ProcessedMessage, pm);

      // Load + lock order
      const order = await qr.manager
        .createQueryBuilder(Order, 'o')
        .where('o.id = :id', { id: orderId })
        .setLock('pessimistic_write')
        .getOne();

      if (!order) {
        // Permanent failure: order missing
        throw new Error(`Order not found: ${orderId}`);
      }

      if (order.status === 'processed') {
        await qr.commitTransaction();
        this.logger.log({ ...logBase, result: 'success', note: 'already processed' } as any);
        chAck();
        return;
      }

      // Simulate heavy work / external call
      await sleep(200 + Math.floor(Math.random() * 300));

      // Demo knob: force failures to test retry/DLQ
      const failProb = Number(process.env.ORDERS_FAIL_PROB ?? 0);
      if (failProb > 0 && Math.random() < failProb) {
        throw new Error('Simulated worker failure (ORDERS_FAIL_PROB)');
      }

      order.status = 'processed';
      order.processedAt = new Date();
      await qr.manager.save(order);

      await qr.commitTransaction();
      this.logger.log({ ...logBase, result: 'success' } as any);
      chAck();
    } catch (e: any) {
      // If messageId already processed → ack and exit (idempotent)
      if (e?.code === '23505') {
        await qr.rollbackTransaction();
        this.logger.warn({ ...logBase, result: 'success', note: 'duplicate messageId' } as any);
        chAck();
        return;
      }

      await qr.rollbackTransaction();

      const reason = e?.message || String(e);

      // Controlled retry via retry queue (TTL -> DLX back to process)
      if (attempt < this.maxAttempts) {
        const next: OrdersProcessMessage = { ...payload, attempt: attempt + 1 };
        this.rabbit.publishJson(this.rabbit.rkRetry, next, {
          messageId: next.messageId,
          correlationId: payload.correlationId ?? payload.messageId,
        });

        this.logger.warn({ ...logBase, result: 'retry', reason } as any);
        chAck(); // ack original after republish
        return;
      }

      // DLQ
      this.rabbit.publishJson(this.rabbit.rkDlq, payload, {
        messageId: payload.messageId,
        correlationId: payload.correlationId ?? payload.messageId,
      });
      this.logger.error({ ...logBase, result: 'dlq', reason } as any);
      chAck();
    } finally {
      await qr.release();
    }
  }
}
