import { Field, ID, ObjectType } from '@nestjs/graphql';
import { OrderItemModel } from './order-item.model';
import { GqlOrderStatus } from './order-status.enum';

@ObjectType('Order')
export class OrderModel {
  @Field(() => ID)
  id: string;

  @Field(() => GqlOrderStatus)
  status: GqlOrderStatus;

  @Field()
  createdAt: Date;

  // [OrderItem!]! (non-null list of non-null items)
  @Field(() => [OrderItemModel])
  items: OrderItemModel[];
}
