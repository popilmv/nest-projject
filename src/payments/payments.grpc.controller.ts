import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PaymentsStore } from './payments.store';

@Controller()
export class PaymentsGrpcController {
  constructor(private readonly store: PaymentsStore) {}

  // service PaymentsService { rpc Authorize ... }
  @GrpcMethod('PaymentsService', 'Authorize')
  authorize(req: {
    order_id: string;
    amount_cents: number;
    currency: string;
    idempotency_key?: string;
  }): { payment_id: string; status: string } {
    const rec = this.store.authorize(req);
    return { payment_id: rec.payment_id, status: rec.status };
  }

  @GrpcMethod('PaymentsService', 'GetPaymentStatus')
  getPaymentStatus(req: { payment_id: string }): {
    payment_id: string;
    status: string;
  } {
    const rec = this.store.getStatus(req.payment_id);
    if (!rec) {
      // For homework simplicity, return FAILED when not found.
      // In real services, we'd return NOT_FOUND via gRPC status.
      return { payment_id: req.payment_id, status: 'PAYMENT_STATUS_FAILED' };
    }
    return { payment_id: rec.payment_id, status: rec.status };
  }

  // Stubs
  @GrpcMethod('PaymentsService', 'Capture')
  capture(req: { payment_id: string }): { payment_id: string; status: string } {
    return { payment_id: req.payment_id, status: 'PAYMENT_STATUS_CAPTURED' };
  }

  @GrpcMethod('PaymentsService', 'Refund')
  refund(req: { payment_id: string }): { payment_id: string; status: string } {
    return { payment_id: req.payment_id, status: 'PAYMENT_STATUS_REFUNDED' };
  }
}
