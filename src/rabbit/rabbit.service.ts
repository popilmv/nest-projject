import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

export type OrdersProcessMessage = {
  messageId: string;
  orderId: string;
  createdAt: string;
  attempt: number;
  correlationId?: string;
  producer?: string;
  eventName?: string;
};

@Injectable()
export class RabbitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitService.name);

  private conn?: amqp.ChannelModel;
  private ch?: amqp.Channel;

  // Topology (documented in README)
  readonly exchange = 'orders.exchange';
  readonly processQueue = 'orders.process';
  readonly retryQueue = 'orders.retry.5s';
  readonly dlqQueue = 'orders.dlq';

  readonly rkProcess = 'orders.process';
  readonly rkRetry = 'orders.retry';
  readonly rkDlq = 'orders.dlq';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('RABBITMQ_URL') || 'amqp://guest:guest@localhost:5672';
    this.conn = await amqp.connect(url);
    this.ch = await this.conn.createChannel();

    // Make publisher confirms optional later; for now regular channel is enough.
    await this.assertTopology();

    this.logger.log('RabbitMQ connected and topology asserted');
  }

  async onModuleDestroy() {
    try {
      await this.ch?.close();
    } catch {}
    try {
      await this.conn?.close();
    } catch {}
  }

  private get channel(): amqp.Channel {
    if (!this.ch) throw new Error('Rabbit channel is not initialized');
    return this.ch;
  }

  async assertTopology() {
    const ch = this.channel;

    // Direct exchange: route by routing key
    await ch.assertExchange(this.exchange, 'direct', { durable: true });

    // Main work queue
    await ch.assertQueue(this.processQueue, {
      durable: true,
      // do NOT rely on DLX for retries here; we do explicit republish to retry queue
    });
    await ch.bindQueue(this.processQueue, this.exchange, this.rkProcess);

    // Retry queue: TTL then dead-letter back to process
    const retryDelayMs = Number(this.config.get('ORDERS_RETRY_DELAY_MS') ?? 5000);
    await ch.assertQueue(this.retryQueue, {
      durable: true,
      messageTtl: retryDelayMs,
      deadLetterExchange: this.exchange,
      deadLetterRoutingKey: this.rkProcess,
    });
    await ch.bindQueue(this.retryQueue, this.exchange, this.rkRetry);

    // DLQ
    await ch.assertQueue(this.dlqQueue, { durable: true });
    await ch.bindQueue(this.dlqQueue, this.exchange, this.rkDlq);
  }

  publishJson(routingKey: string, payload: unknown, opts?: { messageId?: string; correlationId?: string }) {
    const ch = this.channel;
    const content = Buffer.from(JSON.stringify(payload));
    return ch.publish(this.exchange, routingKey, content, {
      persistent: true,
      contentType: 'application/json',
      messageId: opts?.messageId,
      correlationId: opts?.correlationId,
    });
  }

  async consume(queue: string, onMessage: (msg: amqp.ConsumeMessage) => Promise<void>) {
    const ch = this.channel;
    await ch.prefetch(10);

    await ch.consume(
      queue,
      async (msg) => {
        if (!msg) return;
        try {
          await onMessage(msg);
        } catch (e: any) {
          // Last resort: don't lose message; let it be redelivered.
          this.logger.error(`Unhandled consumer error: ${e?.message || e}`, e?.stack);
          ch.nack(msg, false, true);
        }
      },
      { noAck: false },
    );
  }

  ack(msg: amqp.Message) {
    this.channel.ack(msg);
  }

  nack(msg: amqp.Message, requeue = true) {
    this.channel.nack(msg, false, requeue);
  }
}
