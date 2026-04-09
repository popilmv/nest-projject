# Async Orders Processing via RabbitMQ (Work Queue + Retry + DLQ + Idempotent Worker)

This repo includes an **async workflow** for order processing:

- API **quickly** creates an order with `status=pending` and publishes a message to RabbitMQ (`orders.process`).
- A **worker** consumes messages (manual ack), processes the order in a DB transaction, and sets `status=processed`.
- **Retry** is controlled: max attempts + fixed delay.
- After max attempts message goes to **DLQ**.
- Worker is **idempotent** via `processed_messages.message_id` unique constraint.

## Quick start (docker)

1) Create `.env` from `.env.example`

2) Run infrastructure + API + worker:

```bash
docker compose up --build
```

- API: `http://localhost:8080`
- RabbitMQ UI: `http://localhost:15672` (guest/guest)

<img width="936" height="960" alt="image" src="https://github.com/user-attachments/assets/401df3c6-c10c-49a3-b903-d2166a06c7ea" />


## Producer (API)

Endpoint:

```http
POST /orders
Idempotency-Key: <any string>
Content-Type: application/json
```

Response includes `order` and `messageId`.

Message format published to queue:

```json
{
  "messageId": "uuid",
  "orderId": "uuid",
  "createdAt": "ISO date",
  "attempt": 0,
  "correlationId": "uuid",
  "producer": "orders-api",
  "eventName": "orders.process"
}
```

## Worker

Run locally without docker (optional):

```bash
npm run start:worker
```

### Workflow (manual ack)

```
received message
-> start DB transaction
-> INSERT processed_messages(message_id)    (idempotency)
-> update order (status=processed, processedAt)
-> COMMIT
-> ACK
```

Ack happens **only after** commit.

## Retry + DLQ

Config (env):

- `ORDERS_MAX_ATTEMPTS` (default `3`)
- `ORDERS_RETRY_DELAY_MS` (default `5000`)

Implementation: **republish + ack** with a dedicated retry queue with TTL.

If processing fails:

- if `attempt < MAX`: publish to `orders.retry.5s` with `attempt+1`, then `ack` original
- else: publish to `orders.dlq`, then `ack` original

## RabbitMQ topology

Exchange:
- `orders.exchange` (direct)

Queues + bindings:

- `orders.process`  <- `orders.exchange` with routing key `orders.process`
- `orders.retry.5s` <- `orders.exchange` with routing key `orders.retry`
  - arguments: `x-message-ttl = ORDERS_RETRY_DELAY_MS`
  - arguments: `x-dead-letter-exchange = orders.exchange`
  - arguments: `x-dead-letter-routing-key = orders.process`
- `orders.dlq`      <- `orders.exchange` with routing key `orders.dlq`

How to verify in UI:

1) Open Exchanges -> `orders.exchange` to see bindings
2) Open Queues -> publish a message to `orders.process` or watch messages flow
3) If you force errors (see below), you will see messages accumulate in `orders.dlq`

## Demo сценарії

### 1) Happy path
1) `POST /orders` -> order `pending`
2) worker -> order `processed`

### 2) Retry
Set env in worker to simulate failures (example):

```bash
export ORDERS_FAIL_PROB=1
```

*(Not implemented in code by default — easiest is to throw an error inside `OrdersWorker` temporarily.)*

Then create an order and observe `attempt` increments and message cycles through retry queue.

### 3) DLQ
With forced failures, after `ORDERS_MAX_ATTEMPTS` message is published to `orders.dlq`.

### 4) Idempotency
Republish the same JSON to `orders.process` **with the same `messageId`**.
Worker will log `duplicate messageId` and **will not** repeat side effects.

---

# Transactional Order Creation + SQL Optimization (NestJS + PostgreSQL + TypeORM)

## Goal
Implement safe `createOrder` for an e-commerce backend:
- no partial writes (transaction)
- idempotency (double-submit safe)
- oversell protection (concurrency)

---

## Tech stack
- NestJS
- PostgreSQL (local)
- TypeORM
- QueryRunner transactions
- Pessimistic locking (row-level)

```
npm i @nestjs/typeorm typeorm pg
npm i @nestjs/config
```

I use local PosgreSQL so create new DB:
```
CREATE DATABASE ecommerce_db_hw;
```
## RUN API
```
npm run start:dev
```
## GraphQL

GraphQL endpoint: `http://localhost:3000/graphql`

Homework notes (schema/resolvers/dataloader + N+1 proof): see **homework07.md**.

---

# Homework Files (S3 + Presigned URLs)

## What is implemented

- `FileRecord` metadata stored in Postgres (`file_records` table)
- S3 stores bytes (direct upload, backend does **not** proxy file bytes)
- File lifecycle: `pending -> ready` (via `/files/complete`)
- Domain integration: Product has `imageFileId`
- Delivery URL: public files return S3 URL (or CloudFront if `CLOUDFRONT_BASE_URL` is set)
- Ownership checks:
  - only **owner** can `complete` the file
  - product images presign requires `admin`

## Required env

Copy `.env.example` to `.env` and fill AWS values:

```env
AWS_REGION=eu-central-1
S3_BUCKET=nodejs-homework-27
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
FILES_PRESIGN_EXPIRES_SEC=120
```

## Runtime verification: presign -> upload -> complete

> This repo does not include JWT yet. For demo we use DEV auth headers:
> - `x-user-id: <uuid>` (required)
> - `x-user-role: admin|user` (optional)

Install jq (optional but recommended):

```bash
sudo apt-get update && sudo apt-get install -y jq
```

### 0) Choose a PRODUCT_ID

Use an existing product id from DB:

```sql
SELECT id, title FROM products;
```

### 1) Presign

```bash
BASE_URL=http://localhost:3000
USER_ID=00000000-0000-0000-0000-000000000001
ROLE=admin
PRODUCT_ID=<PUT_PRODUCT_ID_HERE>

RESP=$(curl -s -X POST "$BASE_URL/files/presign" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -H "x-user-role: $ROLE" \
  -d "{\"entityType\":\"product\",\"entityId\":\"$PRODUCT_ID\",\"contentType\":\"image/png\",\"size\":5,\"visibility\":\"public\"}")

echo "$RESP" | jq .

FILE_ID=$(echo "$RESP" | jq -r .fileId)
UPLOAD_URL=$(echo "$RESP" | jq -r .uploadUrl)
```

### 2) Direct upload to S3 (PUT uploadUrl)

```bash
printf "hello" > tiny.png

curl -i -X PUT "$UPLOAD_URL" \
  -H 'Content-Type: image/png' \
  --data-binary @tiny.png
```

Expected: `HTTP/1.1 200 OK`

### 3) Complete (pending -> ready)

```bash
curl -s -X POST "$BASE_URL/files/complete" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d "{\"fileId\":\"$FILE_ID\"}" | jq .
```

Expected:

```json
{ "ok": true }
```

### 4) Get delivery URL

```bash
curl -s "$BASE_URL/files/$FILE_ID" \
  -H "x-user-id: $USER_ID" | jq .
```

## Ownership checks (negative tests)

### A) Another user cannot complete чужий файл

```bash
OTHER_USER_ID=00000000-0000-0000-0000-000000000002

curl -i -X POST "$BASE_URL/files/complete" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $OTHER_USER_ID" \
  -d "{\"fileId\":\"$FILE_ID\"}"
```

Expected: `403 Forbidden`

### B) Non-admin cannot presign product image

```bash
curl -i -X POST "$BASE_URL/files/presign" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -H "x-user-role: user" \
  -d "{\"entityType\":\"product\",\"entityId\":\"$PRODUCT_ID\",\"contentType\":\"image/png\",\"size\":5,\"visibility\":\"public\"}"
```

Expected: `403 Forbidden`

## Seed demo data
```
npm run seed
```
<img width="474" height="195" alt="image" src="https://github.com/user-attachments/assets/4226256d-5336-435e-b655-6281d398211b" />

## Transactional createOrder
> Security note: `POST /orders` now requires the DEV auth header. The authenticated principal is used as the real order owner.

```
curl -i \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-key-1" \
  -H "x-user-id: e74c8128-ec97-40ab-bc1c-7f420d541a2c" \
  -d "{
    \"items\":[{\"productId\":\"b6106263-a610-4dc8-9be6-74f42a87ed4d\",\"quantity\":1}]
  }" \
  http://localhost:3000/orders
```

<img width="1601" height="486" alt="image" src="https://github.com/user-attachments/assets/443d82bc-e9fb-44bb-b6ee-8feebb094ba1" />


## No partial writes

Trigger a business error:




<img width="407" height="108" alt="image" src="https://github.com/user-attachments/assets/64faea3b-7738-44aa-b0ce-496b4af3af53" />


<img width="1645" height="276" alt="image" src="https://github.com/user-attachments/assets/06b74071-4346-4768-9208-d90807d3e212" />


## Before / After

SQL Optimization (Orders by status and date)
Hot query

```
SELECT id, "userId", status, "createdAt"
FROM orders
WHERE status = 'created'
  AND "createdAt" >= NOW() - interval '7 days'
ORDER BY "createdAt" DESC
LIMIT 50;
```
This query is used to fetch the latest created orders for admin views with filtering by status and creation date.

Before optimization (no index)
Execution plan highlights:
PostgreSQL performed a Seq Scan on the orders table.
Most rows were filtered out by status and createdAt conditions.
An additional Sort (top-N heapsort) step was required for ORDER BY createdAt DESC.
Execution time was around 10–12 ms with a large number of rows removed by filter.
This approach does not scale well as the table grows.

*Optimization*

A partial index was added to match the query pattern:

```
CREATE INDEX idx_orders_created_createdat_desc
ON orders ("createdAt" DESC)
WHERE status = 'created';
```

After optimization
Execution plan highlights:
PostgreSQL switched to an Index Scan using idx_orders_created_createdat_desc.
Rows are returned already ordered, so no additional sort step is needed.
Significantly fewer pages are read (Buffers: shared hit=50 read=2).
Execution time dropped to approximately 0.33 ms.

## Conclusion

Before optimization, PostgreSQL scanned the entire orders table, filtered out most rows, and performed an extra sort operation.
After introducing a partial index aligned with the WHERE and ORDER BY clauses, the planner was able to use an index scan and avoid sorting altogether.
This reduced query execution time by more than an order of magnitude and significantly improved scalability.


---

## Files (S3) homework: presigned upload flow

### Env
Copy `.env.example` -> `.env` and set:
- `AWS_REGION`
- `S3_BUCKET` (already set to `nodejs-homework-27`)
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (local dev only)

### API
**DEV auth** is enabled for this homework (replace with JWT guard in production).
Send headers:
- `x-user-id: <uuid>`
- `x-user-role: admin` (required for product image upload)

Endpoints:
- `POST /files/presign`
- `PUT <uploadUrl>` (direct to S3)
- `POST /files/complete`
- `GET /files/:id` (returns view URL; public -> CloudFront/S3 URL, private -> presigned GET)

### Example curl
```bash
# 1) presign
curl -X POST http://localhost:3000/files/presign \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: 00000000-0000-0000-0000-000000000001' \
  -H 'x-user-role: admin' \
  -d '{"entityType":"product","entityId":"<PRODUCT_ID>","contentType":"image/png","size":12345,"visibility":"public"}'

# 2) upload to S3
curl -X PUT '<uploadUrl>' -H 'Content-Type: image/png' --data-binary @./local.png

# 3) complete
curl -X POST http://localhost:3000/files/complete \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: 00000000-0000-0000-0000-000000000001' \
  -d '{"fileId":"<FILE_ID>"}'
```
---

## Docker

This repo supports:

- **prod-like** local run (API + Postgres) via `compose.yml`
- **dev** run with hot reload & bind-mount via `compose.dev.yml`
- multi-stage **Dockerfile targets**: `dev`, `build`, `prod`, `prod-distroless`
- DB jobs as **one-off containers**: `migrate` and `seed`

### Files added

- `Dockerfile` — multi-stage build (dev/build/prod/prod-distroless)
- `compose.yml` — prod-like stack (API + Postgres + jobs)
- `compose.dev.yml` — dev override (hot reload + bind mount)
- `.dockerignore` — excludes `node_modules`, `dist`, `.git`, `.env`, logs, etc.
- `.env.example` — example env (no secrets)

### 1) Setup env

Create your local `.env` from `.env.example`:

```bash
cp .env.example .env
```

> `.env` must **not** be committed. It is ignored by `.dockerignore` and should be in `.gitignore`.

### 2) Dev (hot reload)

```bash
docker-compose -f compose.yml -f compose.dev.yml up --build
```

- API: http://localhost:8080
- Postgres: **not exposed** (no `ports:`), only available on the internal network.

### 3) Prod-like local run

```bash
docker-compose -f compose.yml up --build
```

### 4) Run DB jobs (one-off containers)

Migrate (schema sync in this project):

```bash
docker-compose -f compose.yml --profile jobs run --rm migrate
```

Seed:

```bash
docker-compose -f compose.yml --profile jobs run --rm seed
```

### 5) Distroless proof (must start)

Run distroless API variant (on **8081**):

```bash
docker-compose -f compose.yml --profile distroless up --build api-distroless
```

### 6) Image size & history (proof of optimization)

Build targets:

```bash
docker build --target dev -t ecommerce-api:dev .
docker build --target prod -t ecommerce-api:prod .
docker build --target prod-distroless -t ecommerce-api:prod-distroless .
```

Compare sizes:

```bash
docker image ls | grep ecommerce-api
```

Show layer history:

```bash
docker history ecommerce-api:prod
docker history ecommerce-api:prod-distroless
```

**Expected outcome:** `prod-distroless` is smaller and has fewer tools (no shell/package manager), so the attack surface is lower.

### 7) Non-root proof

Prod (alpine) container runs as `node` user:

```bash
docker-compose exec api id
```

Distroless has no shell; non-root is guaranteed by the base image defaults.
(If you need a hard proof, run the `prod` target for `id` and document that `prod-distroless` uses a nonroot distroless base.)

---

# Homework: gRPC Payments microservice

This repo now contains **two runnable NestJS processes**:

1) **orders-service** (existing HTTP API): `src/main.ts`
2) **payments-service** (new gRPC server): `src/payments-main.ts`

Orders talks to Payments **only via the `.proto` contract** (no direct import of payments-service classes/modules).

## Contract

`proto/payments.proto` is the source of truth for Orders ↔ Payments.

Implemented RPCs:

- `Authorize(order_id, amount_cents, currency, idempotency_key)` → `{ payment_id, status }`
- `GetPaymentStatus(payment_id)` → `{ payment_id, status }`

`Capture/Refund` are declared as stubs in the contract.

## Environment variables

Copy `.env.example` → `.env`.

Required for this homework:

- `PAYMENTS_GRPC_BIND` — bind address for payments-service (default `0.0.0.0:50051`)
- `PAYMENTS_GRPC_URL` — address used by orders-service to reach payments-service (default `localhost:50051`)
- `PAYMENTS_GRPC_TIMEOUT_MS` — gRPC deadline for `Authorize` from orders-service (default `800`)

## How to run locally (2 terminals)

Install deps:

```bash
npm i
```

Terminal #1 (Payments gRPC server):

```bash
npm run start:payments:dev
```

Terminal #2 (Orders HTTP API):

```bash
npm run start:dev
```

## Happy path (end-to-end)

Call Orders create endpoint. Orders will:

1) create the order
2) call `Payments.Authorize` over gRPC
3) return `{ order, payment: { payment_id, status } }`

Example:

```bash
curl -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: test-1' \
  -d '{
    "userId": "00000000-0000-0000-0000-000000000001",
    "items": [
      {"productId": "<PUT_EXISTING_PRODUCT_ID>", "quantity": 1}
    ]
  }'
```

Expected payment:

- `payment.status = PAYMENT_STATUS_AUTHORIZED`

## Deadline/timeout

Orders sets a real gRPC **deadline** on `Authorize` using `PAYMENTS_GRPC_TIMEOUT_MS`.
If payments-service is slow/unavailable, the call fails with a gRPC error (e.g. `DEADLINE_EXCEEDED`).


---

# Homework: CI/CD pipeline (GitHub Actions + GHCR + Docker Compose)

## What was added

- `pr-checks.yml` for pull requests into `develop` and `main`
- `build-and-stage.yml` for immutable Docker build, GHCR push, `release-manifest.json`, and automatic deploy to `stage`
- `deploy-prod.yml` for manual production deployment with GitHub Environment approval
- `ops/compose.deploy.yml` for real runtime deployment of:
  - `orders-api`
  - `payments`
  - `worker`
- `scripts/deploy.sh` and `scripts/smoke-check.sh`
- `/health` and `/ready` endpoints for post-deploy verification

## Git strategy

Recommended branch model for the homework:

- `feature/*` -> open PR into `develop`
- `develop` -> auto build + auto deploy to `stage`
- `main` -> protected stable branch for approved releases
- optional: `release/*`, `hotfix/*`

`pr-checks.yml` is the required gate for PRs into `develop` and `main`.

To fully block merges, configure branch protection in GitHub:

- require status checks to pass before merging
- mark `pr-checks / quality-gates` as required
- protect `main` and `develop`

## Workflow overview

### 1) PR checks

File: `.github/workflows/pr-checks.yml`

Runs on pull requests to `develop` and `main`.

Checks:

- `npm ci`
- lint
- unit tests
- `npm run build`
- Docker build validation (`docker build --target prod ...`)

This gives both classic code quality checks and one extra release-oriented gate.

### 2) Build + stage deploy

File: `.github/workflows/build-and-stage.yml`

Runs automatically on push to `develop`.

What it does:

1. builds production Docker image
2. pushes image to GHCR
3. uses immutable tag: `sha-<commit>`
4. stores `release-manifest.json`
5. deploys the same image to `stage`
6. runs smoke checks against `/health` and `/ready`

Example image reference:

```text
ghcr.io/<owner>/<repo>:sha-<commit>
```

Example release manifest:

```json
{
  "commit": "<sha>",
  "imageTag": "sha-<commit>",
  "services": {
    "orders-api": {
      "image": "ghcr.io/<owner>/<repo>:sha-<commit>",
      "digest": "sha256:..."
    },
    "payments": {
      "image": "ghcr.io/<owner>/<repo>:sha-<commit>",
      "digest": "sha256:..."
    },
    "worker": {
      "image": "ghcr.io/<owner>/<repo>:sha-<commit>",
      "digest": "sha256:..."
    }
  }
}
```

### 3) Production deploy

File: `.github/workflows/deploy-prod.yml`

Runs manually through `workflow_dispatch`.

Requirements implemented:

- GitHub Environment: `production`
- manual approval is handled by environment protection rules
- `concurrency` blocks parallel production deploys
- production deploy uses the exact immutable image tag from stage
- production workflow does **not** rebuild Docker image

Manual inputs:

- `image_tag`
- `commit_sha`
- `image_digest` (optional, for audit trail)

## Deployment target

This solution uses the allowed deployment style:

- **GitHub Actions**
- **GHCR** as registry
- **self-hosted runner + Docker Compose** as runtime target
- separate stage/prod deployments via different project names and environment secrets

The real deploy is done through:

- `ops/compose.deploy.yml`
- `scripts/deploy.sh`

That means stage/prod deployment is not a fake `echo deploy done`; it actually:

1. pulls immutable images
2. starts infrastructure (`postgres`, `rabbitmq`)
3. runs migrations
4. starts `orders-api`, `payments`, and `worker`
5. verifies `/health` and `/ready`

## Required GitHub Environments

Create two environments in repository settings:

- `stage`
- `production`

Recommended:

- `stage` -> no manual approval
- `production` -> required reviewers enabled

## Required secrets

### Shared

- `AWS_REGION`
- `S3_BUCKET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

### Stage

- `STAGE_APP_URL`
- `STAGE_API_PORT`
- `STAGE_DB_NAME`
- `STAGE_DB_USER`
- `STAGE_DB_PASSWORD`
- `STAGE_DB_HOST`
- `STAGE_DB_PORT`
- `STAGE_RABBITMQ_URL`
- `STAGE_RABBITMQ_MANAGEMENT_PORT`

### Production

- `PROD_APP_URL`
- `PROD_API_PORT`
- `PROD_DB_NAME`
- `PROD_DB_USER`
- `PROD_DB_PASSWORD`
- `PROD_DB_HOST`
- `PROD_DB_PORT`
- `PROD_RABBITMQ_URL`
- `PROD_RABBITMQ_MANAGEMENT_PORT`

No secrets are committed into the repository.

## Self-hosted runner expectations

The stage/prod runner should have:

- Docker Engine
- Docker Compose v2
- network access to GHCR
- enough disk space for images/volumes

Recommended labels:

- `self-hosted`
- `linux`
- `x64`

## Health checks used by pipeline

Added endpoints:

- `GET /health`
- `GET /ready`

`/ready` also checks database connectivity with `SELECT 1`.

## End-to-end release flow

1. create branch `feature/...`
2. open PR into `develop`
3. PR workflow runs quality gates
4. merge into `develop`
5. `build-and-stage.yml` builds image and deploys to `stage`
6. copy immutable tag from logs or release manifest, for example:
   - `sha-2f1c...`
7. start `deploy-prod.yml`
8. enter:
   - `image_tag=sha-...`
   - `commit_sha=<full sha>`
   - `image_digest=sha256:...` (optional)
9. approve deployment in protected `production` environment
10. production runner deploys the exact same artifact

## Why this satisfies the homework

- PR pipeline exists
- lint exists
- unit tests exist
- extra gate exists: Docker build validation
- Docker artifact is built and pushed to registry
- immutable tag is used
- stage environment is used
- stage deploy is real
- smoke check exists after deploy
- production environment is used
- manual approval is expected through environment protection
- production deploy uses the same artifact tag
- production deploy does not rebuild the image
- parallel production deploys are blocked with `concurrency`

## What to screenshot for submission

Take 2-4 screenshots:

1. successful PR checks
2. successful build + stage deploy
3. production approval screen
4. successful production deploy

---

## Security hardening baseline

This repo now includes a minimal security baseline for the riskiest surfaces.

### What changed
- `trust proxy` enabled so client IP / proxied HTTPS posture are interpreted correctly
- validation tightened with `forbidNonWhitelisted: true`
- security headers baseline added via middleware
- request and correlation ids are attached to every response
- two rate-limit modes are active:
  - **default** for general API traffic
  - **strict** for sensitive routes (`POST /orders`, `POST /files/presign`, `POST /files/complete`, `/graphql`)
- structured audit logging added for critical events
- GraphQL playground disabled in production
- DB query logging is disabled by default unless `DB_LOG_QUERIES=true`

### Critical events currently audited
- suspicious auth events (`auth.missing_user_header`, `auth.invalid_role_header`)
- order creation (`orders.create.accepted`, `orders.create.reused`, `orders.create.failed`)
- file write/read flows (`files.presign.*`, `files.complete.*`, `files.read_url.*`)
- rate-limit denials (`abuse.rate_limit_exceeded`)

### Verification quick checks
#### 1) Headers
```bash
curl -i http://localhost:8080/orders   -H 'x-user-id: 00000000-0000-0000-0000-000000000001'
```
Check for:
- `x-request-id`
- `x-correlation-id`
- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `referrer-policy: no-referrer`
- `ratelimit-policy`
- `ratelimit-limit`
- `ratelimit-remaining`

#### 2) Strict rate limit
```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w '%{http_code}
'     -X POST http://localhost:8080/orders     -H 'Content-Type: application/json'     -H 'Idempotency-Key: demo-key-'"$i"     -H 'x-user-id: 00000000-0000-0000-0000-000000000001'     -d '{"items":[{"productId":"11111111-1111-1111-1111-111111111111","quantity":1}]}'
done
```
Expected: after the strict budget is exhausted you get `429`.

#### 3) Audit logging
```bash
docker compose logs -f api
```
In another shell trigger:
```bash
curl -i http://localhost:8080/files/some-id
```
Expected audit event: `auth.missing_user_header`

### Security homework deliverables
See:
- `security-homework/SECURITY-BASELINE.md`
- `security-homework/secret-flow-note.md`
- `security-homework/tls-note.md`
- `security-homework/security-evidence/*`

### Notes
- DEV auth via `x-user-id` / `x-user-role` is still only a training setup.
- Production target state should replace this with JWT/session auth, centralized secret delivery, and edge TLS termination.

