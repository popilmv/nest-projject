import { Module } from '@nestjs/common';
import { PaymentsGrpcController } from './payments.grpc.controller';
import { PaymentsStore } from './payments.store';

@Module({
  controllers: [PaymentsGrpcController],
  providers: [PaymentsStore],
})
export class PaymentsGrpcModule {}
