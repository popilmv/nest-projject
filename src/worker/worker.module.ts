import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileRecord } from '../modules/files/entities/file-record.entity';
import { OrderItem } from '../modules/orders/order-item.entity';
import { Order } from '../modules/orders/order.entity';
import { ProcessedMessage } from '../modules/orders/processed-message.entity';
import { Product } from '../modules/products/product.entity';
import { User } from '../modules/users/user.entity';
import { RabbitModule } from '../rabbit/rabbit.module';
import { OrdersWorker } from './orders.worker';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl:
        process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      entities: [User, Product, Order, OrderItem, ProcessedMessage, FileRecord],
      synchronize: true,
      logging: process.env.TYPEORM_LOGGING === 'true' ? ['query'] : false,
    }),

    RabbitModule,
  ],
  providers: [OrdersWorker],
})
export class WorkerModule {}
