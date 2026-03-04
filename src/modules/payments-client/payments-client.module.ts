import { Module } from '@nestjs/common';
import { PaymentsClient } from './payments.client';

@Module({
  providers: [PaymentsClient],
  exports: [PaymentsClient],
})
export class PaymentsClientModule {}
