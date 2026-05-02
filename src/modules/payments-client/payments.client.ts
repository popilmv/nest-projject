import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

type PaymentStatus =
  | 'PAYMENT_STATUS_UNSPECIFIED'
  | 'PAYMENT_STATUS_PENDING'
  | 'PAYMENT_STATUS_AUTHORIZED'
  | 'PAYMENT_STATUS_CAPTURED'
  | 'PAYMENT_STATUS_FAILED'
  | 'PAYMENT_STATUS_REFUNDED';

type AuthorizeRequest = {
  order_id: string;
  amount_cents: number;
  currency: string;
  idempotency_key?: string;
};

type AuthorizeResponse = {
  payment_id: string;
  status: PaymentStatus;
};

type PaymentsAuthorizeFn = (
  req: AuthorizeRequest,
  meta: grpc.Metadata | undefined,
  options: grpc.CallOptions,
  cb: (err: grpc.ServiceError | null, res?: AuthorizeResponse) => void,
) => void;

type PaymentsServiceClient = {
  authorize?: PaymentsAuthorizeFn;
  Authorize?: PaymentsAuthorizeFn;
};

type PaymentsGrpcPackage = {
  payments: {
    v1: {
      PaymentsService: new (
        address: string,
        credentials: grpc.ChannelCredentials,
      ) => PaymentsServiceClient;
    };
  };
};

@Injectable()
export class PaymentsClient {
  private client: PaymentsServiceClient;

  constructor(private readonly config: ConfigService) {
    const url =
      this.config.get<string>('PAYMENTS_GRPC_URL') || 'localhost:50051';

    const protoPath = join(process.cwd(), 'proto/payments.proto');
    const pkgDef = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const grpcObj = grpc.loadPackageDefinition(
      pkgDef,
    ) as unknown as PaymentsGrpcPackage;

    const paymentsV1 = grpcObj.payments.v1;

    this.client = new paymentsV1.PaymentsService(
      url,
      grpc.credentials.createInsecure(),
    );
  }

  async authorize(input: {
    orderId: string;
    amountCents: number;
    currency: string;
    idempotencyKey?: string;
  }): Promise<AuthorizeResponse> {
    const timeoutMs = Number(
      this.config.get<string>('PAYMENTS_GRPC_TIMEOUT_MS') || '800',
    );

    const deadline = new Date(Date.now() + timeoutMs);

    const req: AuthorizeRequest = {
      order_id: input.orderId,
      amount_cents: input.amountCents,
      currency: input.currency,
      idempotency_key: input.idempotencyKey,
    };

    return await new Promise<AuthorizeResponse>((resolve, reject) => {
      const authorizeMethod = this.client.authorize ?? this.client.Authorize;

      if (!authorizeMethod) {
        return reject(new Error('Payments gRPC authorize method is unavailable'));
      }

      authorizeMethod.call(
        this.client,
        req,
        undefined,
        { deadline },
        (err, res) => {
          if (err) return reject(err);

          if (!res) {
            return reject(new Error('Payments gRPC authorize returned empty response'));
          }

          resolve(res);
        },
      );
    });
  }
}