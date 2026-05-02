import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Order } from './modules/orders/order.entity';
import { ProcessedMessage } from './modules/orders/processed-message.entity';

@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}

  getHello(): string {
    return 'Orders API is running';
  }

  getHealth() {
    return {
      status: 'ok',
      service: 'orders-api',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    try {
      await this.dataSource.query('SELECT 1');

      return {
        status: 'ready',
        service: 'orders-api',
        checks: {
          database: 'ok',
        },
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        service: 'orders-api',
        checks: {
          database: 'failed',
        },
      });
    }
  }

  async getMetrics() {
    const orderStatusRows = await this.dataSource
      .getRepository(Order)
      .createQueryBuilder('orders')
      .select('orders.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('orders.status')
      .getRawMany<{ status: string; count: string }>();

    const processedMessages = await this.dataSource
      .getRepository(ProcessedMessage)
      .count();

    return {
      service: 'orders-api',
      metrics: {
        ordersByStatus: orderStatusRows.reduce<Record<string, number>>(
          (acc, row) => {
            acc[row.status] = Number(row.count);
            return acc;
          },
          {},
        ),
        processedMessages,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
