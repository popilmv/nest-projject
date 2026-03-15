import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  const appServiceMock = {
    getHello: jest.fn(() => 'Hello World!'),
    getHealth: jest.fn(() => ({ status: 'ok', service: 'orders-api' })),
    getReadiness: jest.fn(() =>
      Promise.resolve({
        status: 'ready',
        service: 'orders-api',
        checks: { database: 'ok' },
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
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
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
  });
});
