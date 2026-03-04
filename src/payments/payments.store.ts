import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type PaymentStatus =
  | 'PAYMENT_STATUS_UNSPECIFIED'
  | 'PAYMENT_STATUS_PENDING'
  | 'PAYMENT_STATUS_AUTHORIZED'
  | 'PAYMENT_STATUS_CAPTURED'
  | 'PAYMENT_STATUS_FAILED'
  | 'PAYMENT_STATUS_REFUNDED';

export type PaymentRecord = {
  payment_id: string;
  order_id: string;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
};

@Injectable()
export class PaymentsStore {
  private readonly byId = new Map<string, PaymentRecord>();
  private readonly byIdempotencyKey = new Map<string, string>();

  authorize(input: {
    order_id: string;
    amount_cents: number;
    currency: string;
    idempotency_key?: string;
  }): PaymentRecord {
    const idempotencyKey = input.idempotency_key;
    if (idempotencyKey) {
      const existingId = this.byIdempotencyKey.get(idempotencyKey);
      if (existingId) {
        const existing = this.byId.get(existingId);
        if (existing) return existing;
      }
    }

    const payment_id = randomUUID();
    const rec: PaymentRecord = {
      payment_id,
      order_id: input.order_id,
      amount_cents: input.amount_cents,
      currency: input.currency,
      status: 'PAYMENT_STATUS_AUTHORIZED',
    };

    this.byId.set(payment_id, rec);
    if (idempotencyKey) this.byIdempotencyKey.set(idempotencyKey, payment_id);

    return rec;
  }

  getStatus(payment_id: string): PaymentRecord | undefined {
    return this.byId.get(payment_id);
  }
}
