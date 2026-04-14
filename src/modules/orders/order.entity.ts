import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { OrderItem } from './order-item.entity';

export type OrderStatus = 'pending' | 'processed' | 'failed';

@Entity('orders')
@Index(['userId', 'idempotencyKey'], { unique: true })
@Index(['status', 'createdAt'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (u) => u.orders, { onDelete: 'RESTRICT' })
  user: User;

  @Column({ type: 'text' })
  idempotencyKey: string;

  @Column({ type: 'text', default: 'pending' })
  status: OrderStatus;

  @Column({ type: 'text', nullable: true })
  paymentId?: string | null;

  @Column({ type: 'text', nullable: true })
  paymentStatus?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt?: Date | null;

  @OneToMany(() => OrderItem, (i) => i.order, { cascade: false })
  items: OrderItem[];
}
