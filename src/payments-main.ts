import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { PaymentsAppModule } from './payments/payments.app.module';

async function bootstrap() {
  const url = process.env.PAYMENTS_GRPC_BIND || '0.0.0.0:50051';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    PaymentsAppModule,
    {
      transport: Transport.GRPC,
      options: {
        url,
        package: 'payments.v1',
        protoPath: join(__dirname, '../proto/payments.proto'),
        loader: {
          keepCase: true,
        },
      },
    },
  );

  await app.listen();

  console.log(`Payments gRPC listening on ${url}`);
}

void bootstrap();
