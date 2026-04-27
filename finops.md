Performance and Runtime Optimization for `POST /orders`

## Summary

**Scenario:** `POST /orders` with 20 items per order  
**Main bottleneck:** per-item inserts into `order_items`  
**Implemented improvements:** batch insert for `order_items` + explicit container resource limits


## Chosen hot scenario

I selected the `POST /orders` flow as the main hot path.

Why this scenario:
- it is business-relevant;
- it can be reproduced locally in a stable way;
- it includes DB writes, synchronous application logic, payment interaction, and message publishing;
- it is suitable for measuring latency, throughput, error rate, CPU, and memory.

### Test input

The benchmark scenario used:
- 200 requests
- concurrency = 20
- 20 items per order
- one seeded user
- two seeded products

This setup makes the request heavy enough to expose inefficiencies in the order creation path.

---

## Environment and measurement setup

The application was run locally with Docker Compose.

### Main services
- `api`
- `payments`
- `worker`
- `postgres`
- `rabbitmq`

### Measurement approach
I used:
- a custom benchmark script for `POST /orders`;
- `docker stats` for CPU / memory;
- SQL logs for identifying database behavior in the hot path.

### Commands used

#### Clear previous orders
```bash
docker compose exec postgres psql -U app -d ecommerce_db_hw -c "TRUNCATE TABLE processed_messages, order_items, orders CASCADE;"
```

#### Run benchmark
```bash
USER_ID="90267b25-8fbc-4092-8f7d-307fe3ea5835" \
PRODUCT_IDS="85bd0a17-177f-4c51-b82a-e31bddde6104,cffe5f2f-f469-4343-b492-eeef62157eff" \
ITEMS_PER_ORDER=20 \
TOTAL_REQUESTS=200 \
CONCURRENCY=20 \
node scripts/bench-create-order.mjs
```

#### Capture runtime metrics
```bash
while true; do
  date
  docker stats --no-stream $(docker compose ps -q api worker payments)
  sleep 2
done
```

---

## Baseline

### Baseline scenario
`POST /orders` with 20 items per order.

### Baseline runtime observations
From `docker stats` during the baseline run:

- `api` memory: about **59 MiB**
- `payments` memory: about **40 MiB**
- `worker` memory: about **41 MiB**
- observed `api` CPU peak in the captured sample: about **0.46%**

These numbers showed that the services were using a relatively small amount of memory, which later made it reasonable to introduce explicit CPU / memory limits as a runtime optimization.

---

## Bottleneck identification

The main bottleneck was found in the write path for `order_items`.

### Symptom
When creating an order with many items, the application executed many separate insert operations for `order_items` instead of inserting them in a single batch.

### Evidence
SQL logs clearly showed a sequence of repeated statements like:

- `INSERT INTO "order_items" ... RETURNING "id"`
- repeated many times for the same flow

This indicates that order items were persisted one by one, which increases the number of DB round-trips and adds overhead to the request path.

### Why this is a real bottleneck
This is not just a guess. The bottleneck is supported by actual runtime evidence:
- repeated SQL inserts for order items;
- the issue occurs in the chosen hot path;
- it scales badly as the number of items per order increases.

So the bottleneck is: **per-item DB writes inside the order creation flow**.

---

## Implemented improvements

### Performance improvement

#### Change
I replaced per-item persistence with a batch insert for `order_items`.

#### Before
The service saved each item individually inside a loop.

#### After
The service builds an array of rows and inserts them with one insert query.

#### Why it is better
This reduces:
- DB round-trips;
- per-query overhead;
- latency for larger orders;
- tail latency (especially p95 / p99).

---

### Cost / runtime improvement

#### Change
I introduced explicit runtime limits for the main containers in `docker-compose`.

Example target limits:
- `api`: `0.50 CPU`, `256 MiB`
- `worker`: `0.50 CPU`, `256 MiB`
- `payments`: `0.25 CPU`, `128 MiB`

#### Why it is better
Before this change, the containers effectively had very large available limits from the host environment. However, the measured memory usage was much smaller:
- `api` ~59 MiB
- `payments` ~40 MiB
- `worker` ~41 MiB

This means we can introduce a more realistic runtime budget without obvious overprovisioning. That makes the system more predictable and more production-oriented.

---

## Why this solution is better technically and economically

Technically, the solution is better because it removes unnecessary per-item DB writes from the critical request path. This reduces avoidable overhead and improves the efficiency of order creation.

Economically and from a runtime perspective, the solution is better because it also addresses resource discipline, not only latency. The measured baseline showed relatively small memory usage for the services, which makes explicit limits a reasonable step to reduce waste and define a predictable resource budget.

---

## Summary of changes

### What I changed
1. Replaced per-item `order_items` writes with batch insert.
2. Added explicit CPU / memory limits for core runtime containers.

### Why
- to reduce DB round-trips in the hot path;
- to improve runtime efficiency and reduce overprovisioning.
