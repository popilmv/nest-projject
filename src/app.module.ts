import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from './modules/orders/orders.module';
import { RabbitModule } from './rabbit/rabbit.module';
import { AppGraphqlModule } from './graphql/graphql.module';
import { User } from './modules/users/user.entity';
import { Product } from './modules/products/product.entity';
import { Order } from './modules/orders/order.entity';
import { OrderItem } from './modules/orders/order-item.entity';
import { ProcessedMessage } from './modules/orders/processed-message.entity';
import { FilesModule } from './modules/files/files.module';
import { FileRecord } from './modules/files/entities/file-record.entity';
import { RequestIdMiddleware } from './common/request/request-id.middleware';
import { DefaultRateLimitMiddleware } from './common/security/default-rate-limit.middleware';
import { StrictRateLimitMiddleware } from './common/security/strict-rate-limit.middleware';
import { SecurityHeadersMiddleware } from './common/security/security-headers.middleware';
import { CommonModule } from './common/common.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

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
      logging:
        process.env.DB_LOG_QUERIES === 'true' ? ['query', 'error'] : ['error'],
    }),

    CommonModule,
    RabbitModule,
    OrdersModule,
    FilesModule,
    AppGraphqlModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RequestIdMiddleware,
    SecurityHeadersMiddleware,
    DefaultRateLimitMiddleware,
    StrictRateLimitMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        RequestIdMiddleware,
        SecurityHeadersMiddleware,
        DefaultRateLimitMiddleware,
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });

    consumer
      .apply(StrictRateLimitMiddleware)
      .forRoutes(
        { path: 'orders', method: RequestMethod.POST },
        { path: 'files/presign', method: RequestMethod.POST },
        { path: 'files/complete', method: RequestMethod.POST },
        { path: 'graphql', method: RequestMethod.ALL },
      );
  }
}
