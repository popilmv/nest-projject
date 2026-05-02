import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { FileRecord } from '../modules/files/entities/file-record.entity';
import { OrderItem } from '../modules/orders/order-item.entity';
import { Order } from '../modules/orders/order.entity';
import { ProcessedMessage } from '../modules/orders/processed-message.entity';
import { Product } from '../modules/products/product.entity';
import { User } from '../modules/users/user.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: true,
  entities: [User, Product, Order, OrderItem, ProcessedMessage, FileRecord],
});
