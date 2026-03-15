import { Context, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { OrderItemModel } from './models/order-item.model';
import { ProductModel } from './models/product.model';

type OrderItemParent = {
  productId: string;
};

type OrderItemResolverContext = {
  loaders: {
    productById: {
      load: (productId: string) => Promise<ProductModel | null>;
    };
  };
};

@Resolver(() => OrderItemModel)
export class OrderItemResolver {
  @ResolveField(() => ProductModel)
  product(
    @Parent() item: OrderItemParent,
    @Context() ctx: OrderItemResolverContext,
  ): Promise<ProductModel | null> {
    return ctx.loaders.productById.load(item.productId);
  }
}
