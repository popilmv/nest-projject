import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsGrpcModule } from './payments.grpc.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PaymentsGrpcModule,
  ],
})
export class PaymentsAppModule {}
