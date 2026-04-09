import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../modules/users/user.entity';
import { Product } from '../modules/products/product.entity';
import { Order } from '../modules/orders/order.entity';
import { OrderItem } from '../modules/orders/order-item.entity';
import { ProcessedMessage } from '../modules/orders/processed-message.entity';
import { FileRecord } from '../modules/files/entities/file-record.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: true,
  logging: process.env.DB_LOG_QUERIES === 'true' ? ['query', 'error'] : ['error'],
  entities: [User, Product, Order, OrderItem, ProcessedMessage, FileRecord],
});
