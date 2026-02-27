import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ProductModel } from './product.model';

@ObjectType('OrderItem')
export class OrderItemModel {
  @Field(() => ID)
  id: string;

  @Field(() => Int)
  quantity: number;

  // Resolved via DataLoader in a field resolver
  @Field(() => ProductModel)
  product: ProductModel;

  // internal field (not exposed in GraphQL) but present in returned entity
  productId: string;
}
