import { registerEnumType } from '@nestjs/graphql';

// Must match values stored in DB (see Order.entity.ts)
export enum GqlOrderStatus {
  CREATED = 'created',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

registerEnumType(GqlOrderStatus, { name: 'OrderStatus' });
