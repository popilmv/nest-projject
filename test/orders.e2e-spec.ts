import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DevAuthGuard } from '../src/common/auth/dev-auth.guard';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { OrdersController } from '../src/modules/orders/orders.controller';
import { OrdersService } from '../src/modules/orders/orders.service';

describe('Orders main flow (e2e)', () => {
  let app: INestApplication<App>;

  const ordersServiceMock = {
    createOrder: jest.fn((user, dto, idempotencyKey: string) =>
      Promise.resolve({
        reused: false,
        order: {
          id: '20000000-0000-0000-0000-000000000001',
          userId: user.id,
          status: 'pending',
          items: dto.items,
        },
        payment: {
          payment_id: '30000000-0000-0000-0000-000000000001',
          status: 'PAYMENT_STATUS_AUTHORIZED',
        },
        messageId: idempotencyKey,
      }),
    ),
    getOrder: jest.fn((user, orderId: string) =>
      Promise.resolve({
        id: orderId,
        userId: user.id,
        status: 'processed',
        processedAt: new Date('2026-04-27T10:00:00.000Z'),
        items: [
          {
            productId: '10000000-0000-0000-0000-000000000001',
            quantity: 1,
          },
        ],
      }),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        DevAuthGuard,
        {
          provide: OrdersService,
          useValue: ordersServiceMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates an authenticated order and later reads the processed status', async () => {
    const userId = '00000000-0000-0000-0000-000000000001';
    const orderId = '20000000-0000-0000-0000-000000000001';

    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-id', userId)
      .set('x-user-role', 'user')
      .set('idempotency-key', 'test-message-id')
      .send({
        items: [
          {
            productId: '10000000-0000-0000-0000-000000000001',
            quantity: 1,
          },
        ],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.order.status).toBe('pending');
        expect(body.payment.status).toBe('PAYMENT_STATUS_AUTHORIZED');
      });

    await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('x-user-id', userId)
      .set('x-user-role', 'user')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('processed');
        expect(body.userId).toBe(userId);
      });
  });

  it('rejects unauthenticated order creation', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('idempotency-key', 'test-message-id')
      .send({
        items: [
          {
            productId: '10000000-0000-0000-0000-000000000001',
            quantity: 1,
          },
        ],
      })
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe('UNAUTHORIZED');
      });
  });

  it('rejects invalid order payload before service layer', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-id', '00000000-0000-0000-0000-000000000001')
      .set('idempotency-key', 'test-message-id')
      .send({ items: [] })
      .expect(400);

    expect(ordersServiceMock.createOrder).not.toHaveBeenCalled();
  });
});
