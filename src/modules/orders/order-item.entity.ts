import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
  RelationId,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../products/product.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (o) => o.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @RelationId((it: OrderItem) => it.order)
  orderId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @RelationId((it: OrderItem) => it.product)
  productId: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  priceAtPurchase: string;
}
