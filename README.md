# NestJS Orders Backend — full end-to-end business flow

Це backend-система на **NestJS**, яка демонструє не набір окремих endpoint'ів, а один повний наскрізний бізнес-контур:

> **створення замовлення → авторизація платежу → асинхронна обробка → зміна статусу → повторне отримання фінального статусу**

## Що реалізовано

- NestJS API для роботи із замовленнями.
- PostgreSQL як постійне сховище даних.
- RabbitMQ для асинхронної/фонової обробки замовлення.
- Окремий worker, який читає повідомлення з RabbitMQ і переводить замовлення у фінальний статус.
- Internal payments service через gRPC для демонстрації міжсервісної взаємодії.
- DEV authentication guard через HTTP headers.
- Resource-based authorization: користувач бачить тільки свої замовлення, `admin` може читати будь-яке.
- Валідація DTO через `class-validator` + global `ValidationPipe`.
- Машиночитані помилки через global exception filter.
- Idempotency через `Idempotency-Key`.
- Бізнес-правило: не можна створити замовлення, якщо запитана кількість товару більша за залишок на складі.
- Локальний запуск усіх потрібних компонентів через Docker Compose.
- Health/readiness endpoints, HTTP request logs, domain event logs і `/metrics` endpoint.
- Unit test бізнес-правила окремо від HTTP-рівня.
- E2E-style test основного HTTP-контуру: auth → validation → create order → read status.
- GitHub Actions pipeline для lint/test/build/docker build.

## Основний бізнес-контур

| Крок ТЗ | Де реалізовано |
|---|---|
| Клієнт викликає API | `POST /orders` |
| Валідація | `CreateOrderDto`, global `ValidationPipe` |
| Перевірка доступу | `DevAuthGuard`, `CurrentUser`, ownership check у `OrdersService.getOrder()` |
| Бізнес-логіка | `OrdersService.createOrder()` + `order-policy.ts` |
| Збереження даних | PostgreSQL, TypeORM entities `Order`, `OrderItem`, `Product`, `User` |
| Фонова обробка | RabbitMQ message `orders.process`, `OrdersWorker` |
| Повторне отримання результату | `GET /orders/:id` |
| Видимість у логах/monitoring | HTTP logs, domain logs, RabbitMQ UI, `/metrics` |
| Автоматизовані тести | `src/modules/orders/order-policy.spec.ts`, `test/orders.e2e-spec.ts` |
| Працює у деплої | `ops/compose.deploy.yml`, GitHub Actions workflows |

## Архітектура

```txt
client
  │
  ▼
NestJS API
  │  POST /orders
  │  - auth
  │  - validation
  │  - stock check
  │  - payment authorization via gRPC
  │  - save order
  │  - publish RabbitMQ message
  │
  ├── PostgreSQL
  ├── Payments gRPC service
  └── RabbitMQ exchange/queue
          │
          ▼
       Worker
          │
          └── marks order as processed
```

## Локальний запуск через Docker

### 1. Підготувати `.env`

```bash
cp .env.example .env
```

Для локального демо достатньо дефолтних значень з `.env.example`.

### 2. Запустити інфраструктуру та сервіси

```bash
docker compose up -d --build postgres rabbitmq payments
```

### 3. Створити схему та demo data

```bash
docker compose --profile jobs run --rm migrate
docker compose --profile jobs run --rm seed
```

Seed створює стабільні demo IDs:

```txt
USER_ID=00000000-0000-0000-0000-000000000001
PRODUCT_A_ID=10000000-0000-0000-0000-000000000001
PRODUCT_B_ID=10000000-0000-0000-0000-000000000002
```

### 4. Запустити API та worker

```bash
docker compose up -d --build api worker
```

Сервіси:

```txt
API:         http://localhost:8080
RabbitMQ UI: http://localhost:15672  login: guest / guest
```

## Перевірка основного контуру

### 1. Health/readiness

```bash
curl http://localhost:8080/health
curl http://localhost:8080/ready
```

### 2. Створити замовлення

```bash
BASE_URL=http://localhost:8080
USER_ID=00000000-0000-0000-0000-000000000001
PRODUCT_ID=10000000-0000-0000-0000-000000000001
IDEMPOTENCY_KEY=$(date +%s)

curl -s -X POST "$BASE_URL/orders" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -H "x-user-role: user" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d "{\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}]}" | jq .
```

Очікуваний результат одразу після створення:

```json
{
  "reused": false,
  "order": {
    "status": "pending"
  },
  "payment": {
    "status": "PAYMENT_STATUS_AUTHORIZED"
  },
  "messageId": "..."
}
```

### 3. Отримати статус замовлення окремим запитом

Підставити `order.id` з попередньої відповіді:

```bash
ORDER_ID=<order_id_from_response>

curl -s "$BASE_URL/orders/$ORDER_ID" \
  -H "x-user-id: $USER_ID" \
  -H "x-user-role: user" | jq .
```

Через кілька секунд worker має перевести замовлення зі статусу `pending` у `processed`.

### 4. Перевірити observability

```bash
curl -s http://localhost:8080/metrics | jq .
docker compose logs api --tail=100
docker compose logs worker --tail=100
```

Також можна відкрити RabbitMQ Management UI:

```txt
http://localhost:15672
login: guest
password: guest
```

Там видно exchange `orders.exchange`, queues `orders.process`, `orders.retry.5s`, `orders.dlq`.

## Auth модель для демо

У проєкті використовується простий DEV guard, щоб показати auth/authorization без повної JWT-інфраструктури.

Обов'язковий header:

```http
x-user-id: 00000000-0000-0000-0000-000000000001
```

Опціональний header:

```http
x-user-role: user
```

Або:

```http
x-user-role: admin
```

Правила доступу:

- `POST /orders` доступний тільки автентифікованому користувачу.
- `GET /orders/:id`:
  - `user` може читати тільки власні замовлення;
  - `admin` може читати будь-яке замовлення.

## Помилки

Приклад помилки без auth:

```bash
curl -s -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo" \
  -d '{"items":[]}' | jq .
```

Формат відповіді:

```json
{
  "statusCode": 401,
  "code": "UNAUTHORIZED",
  "message": "Missing x-user-id header",
  "path": "/orders",
  "timestamp": "..."
}
```

## Тести

```bash
npm ci
npm test
npm run test:e2e
```

Що важливо для рев'ю:

- `src/modules/orders/order-policy.spec.ts` — unit test бізнес-правила без HTTP.
- `test/orders.e2e-spec.ts` — перевірка основного HTTP-контуру: auth, validation, create, read final status.

## Pipeline

Основний quality gate описаний у:

```txt
.github/workflows/pr-checks.yml
```

Він виконує:

```txt
npm ci
eslint
npm test
npm run build
docker build --target prod
```

Також є stage/prod workflows:

```txt
.github/workflows/build-and-stage.yml
.github/workflows/deploy-prod.yml
```

## Зовнішній деплой

Для деплою підготовлено:

```txt
ops/compose.deploy.yml
scripts/deploy.sh
.github/workflows/build-and-stage.yml
.github/workflows/deploy-prod.yml
```

Мінімальний варіант зовнішнього середовища:

1. VM/VPS з Docker та Docker Compose.
2. GitHub self-hosted runner або ручний запуск `scripts/deploy.sh` на сервері.
3. Secrets у GitHub Actions або `.env.production` на сервері:
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASSWORD`
   - `RABBITMQ_URL`
   - `AWS_*`, якщо демонструється files/S3 частина.
4. Після деплою рев'юеру надати:
   - public API URL;
   - demo user id;
   - demo product id;
   - приклади curl-команд з цього README.

> Важливо: сам факт наявності workflow не замінює реальний деплой. Для здачі потрібно, щоб зовнішній URL реально відповідав на `/health`, `/ready`, `POST /orders`, `GET /orders/:id`.

## Корисні команди

```bash
# Logs
docker compose logs api --tail=100
docker compose logs worker --tail=100

# Stop everything
docker compose down

# Stop and remove DB volume
docker compose down -v

# Rebuild cleanly
docker compose build --no-cache
```
