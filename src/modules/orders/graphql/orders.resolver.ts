import { Args, Query, Resolver } from '@nestjs/graphql';
import { OrdersService } from '../orders.service';
import { OrderModel } from './models/order.model';
import { OrdersFilterInput } from './dto/orders-filter.input';
import { OrdersPaginationInput } from './dto/orders-pagination.input';

@Resolver(() => OrderModel)
export class OrdersResolver {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Thin resolver: just delegates to service layer (no business logic here).
   */
  @Query(() => [OrderModel])
  async orders(
    @Args('filter', { nullable: true }) filter?: OrdersFilterInput,
    @Args('pagination', { nullable: true }) pagination?: OrdersPaginationInput,
  ): Promise<any[]> {
    return this.ordersService.findOrders({ filter, pagination });
  }
}
