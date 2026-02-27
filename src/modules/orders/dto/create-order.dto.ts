export class CreateOrderDto {
  userId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

