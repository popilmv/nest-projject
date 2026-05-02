import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  const appServiceMock = {
    getHello: jest.fn(() => 'Orders API is running'),
    getHealth: jest.fn(() => ({ status: 'ok', service: 'orders-api' })),
    getReadiness: jest.fn(() =>
      Promise.resolve({
        status: 'ready',
        service: 'orders-api',
        checks: { database: 'ok' },
      }),
    ),
    getMetrics: jest.fn(() =>
      Promise.resolve({
        service: 'orders-api',
        metrics: { ordersByStatus: {}, processedMessages: 0 },
      }),
    ),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: appServiceMock,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return service banner', () => {
      expect(appController.getHello()).toBe('Orders API is running');
    });

    it('should return health payload', () => {
      expect(appController.getHealth()).toEqual({
        status: 'ok',
        service: 'orders-api',
      });
    });

    it('should return readiness payload', async () => {
      await expect(appController.getReadiness()).resolves.toEqual({
        status: 'ready',
        service: 'orders-api',
        checks: { database: 'ok' },
      });
    });

    it('should return metrics payload', async () => {
      await expect(appController.getMetrics()).resolves.toEqual({
        service: 'orders-api',
        metrics: { ordersByStatus: {}, processedMessages: 0 },
      });
    });
  });
});
