import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}

  getHello(): string {
    return 'Hello World!';
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
}
