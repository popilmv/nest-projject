import { Context, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { OrderItemModel } from './models/order-item.model';
import { ProductModel } from './models/product.model';

@Resolver(() => OrderItemModel)
export class OrderItemResolver {
  @ResolveField(() => ProductModel)
  product(@Parent() item: any, @Context() ctx: any) {
    // Uses per-request DataLoader to avoid N+1 queries.
    return ctx.loaders.productById.load(item.productId);
  }
}
