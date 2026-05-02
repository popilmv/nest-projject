import { registerEnumType } from '@nestjs/graphql';

// Must match values stored in DB (see Order.entity.ts)
export enum GqlOrderStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

registerEnumType(GqlOrderStatus, { name: 'OrderStatus' });
