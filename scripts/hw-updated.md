# Homework Report: Correctness, Runtime Budgeting, and Performance Investigation for `POST /orders`

## 1. Goal

The goal of this homework was to analyze and improve one concrete hot path in the system instead of making vague claims about “overall optimization”.

I selected one business-critical scenario, captured baseline observations, investigated a real bottleneck, implemented targeted fixes, and documented the resulting state honestly, including the limitations that still remain.

---

## 2. Chosen scenario

The chosen hot path is:

- `POST /orders`

Why this scenario:
- it is business-relevant;
- it touches the main application flow;
- it includes DB writes, payment authorization, and asynchronous message publishing;
- it is suitable for observing correctness, latency, and runtime behavior.

For reproducibility, the scenario was tested locally using the seeded:
- 1 user
- 2 products

---

## 3. Initial problem statement

During review, several issues were identified in the implementation:

1. The main request path was unstable and could fail.
2. The write path for `order_items` did not match the performance story written in the report.
3. The persistence model for `order_items` used an incorrect approach for foreign-key insertion.
4. The report overstated optimization progress compared to what the code actually implemented.

This homework revision focused on fixing those mismatches and documenting the system state based on actual runtime evidence.

---

## 4. Bottleneck and root-cause investigation

The most obvious bottleneck in the original implementation was the write path for `order_items`.

### Observed issue

Originally, order items were saved one by one inside a loop.  
That meant one DB write per item, which increases the number of DB round-trips in the request path.

### Why this mattered

This becomes worse as the number of items per order grows:
- more SQL statements;
- more ORM overhead;
- longer request path;
- worse tail latency potential.

This bottleneck was identified as the most concrete and code-local issue that could be addressed safely within the homework scope.

---

## 5. Implemented fixes

### 5.1 Correctness fix: payments call path

The payments client invocation was fixed so that the `POST /orders` smoke path no longer fails because of the previously incorrect gRPC call form.

This was a required correctness fix before any performance claims could be made.

### 5.2 Correctness fix: proper `order_items` persistence model

The `order_items` entity was updated so that `orderId` and `productId` are stored as real insertable foreign-key fields.

Previously, the code relied on `@RelationId` in a way that was not appropriate for insertion.  
After the fix, `order_items` records are persisted with valid foreign keys.

This was verified directly in the database.

### 5.3 Performance-oriented fix: batch insert for `order_items`

The original per-item save loop was replaced with a single batch insert.

#### Before
Each item was persisted separately inside the transaction.

#### After
The service builds an array of rows and inserts them in one SQL insert operation.

#### Expected effect
This reduces:
- number of DB round-trips;
- ORM overhead;
- work done in the request path.

This is the main performance-oriented code change in the homework.

### 5.4 Runtime / cost fix: explicit container limits

Explicit CPU / memory limits were added for the main services.

Example runtime budgets:
- `api`: `0.50 CPU`, `256 MiB`
- `worker`: `0.50 CPU`, `256 MiB`
- `payments`: `0.25 CPU`, `128 MiB`

This change improves runtime discipline and makes the deployment closer to production-style resource budgeting.

---

## 6. Verification results

### 6.1 Smoke test result

After the correctness fixes, the main smoke scenario succeeded:

- `POST /orders` returned a non-error response;
- `reused: false`;
- `order.status: "pending"`;
- `payment.status: "PAYMENT_STATUS_AUTHORIZED"`.

This confirms that the main business flow became functional after the fixes.

### 6.2 Database verification

The `order_items` table was checked directly after order creation.

The rows contained:
- non-empty `orderId`
- non-empty `productId`
- correct quantities and `priceAtPurchase`

This confirms that the persistence model is now correct and that the original foreign-key insertion problem is fixed.

### 6.3 Runtime verification

Runtime limits were verified through `docker stats`.

A representative reduced benchmark / execution sample showed approximately:

- `api`: ~55.38 MiB / 256 MiB
- `payments`: ~19.59 MiB / 128 MiB
- `worker`: ~22.12 MiB / 256 MiB

CPU usage remained very low during the captured sample.

This indicates that the remaining instability is **not explained by CPU or memory saturation**.

---

## 7. Benchmark findings

A reduced Node-based benchmark was executed with:

- total requests: `5`
- concurrency: `1`
- items per order: `2`
- request timeout: `30000 ms`

Observed result:

- throughput: `0.03 RPS`
- error rate: `100%`
- p50: `30001.41 ms`
- p95: `30007.15 ms`
- p99: `30007.15 ms`
- success count: `0`
- failure count: `5`
- status counts: `408 -> 5`

### Interpretation

This benchmark result is **not consistent with the successful curl-based smoke test**.

Because:
- the curl request succeeds;
- the DB rows are written correctly;
- the services are not resource-saturated;

the most likely conclusion is that the remaining issue is in the benchmark execution path or in blocking behavior triggered specifically by the Node/fetch-driven benchmark, not in basic service availability.

For that reason, I do **not** claim that performance was fully improved under automated load.  
Instead, I document the outcome honestly:

- correctness improved;
- persistence was fixed;
- runtime budgeting was applied;
- but the current Node benchmark path remains unstable and needs additional investigation.

---

## 8. Before / After summary

| Area | Before | After | Status |
|---|---|---|---|
| `POST /orders` smoke flow | unstable / failed | successful smoke response | fixed |
| Payments authorization path | incorrect call path | corrected | fixed |
| `order_items` persistence | incorrect FK insertion model | valid `orderId` and `productId` stored | fixed |
| `order_items` write path | per-item persistence loop | batch insert | improved in code |
| Runtime budgeting | no explicit service limits | explicit CPU / memory limits applied | fixed |
| Automated Node benchmark | unstable | still unstable | not fully resolved |

---

## 9. Trade-offs

The batch insert solution improves the write path, but it also makes the code more query-oriented and less entity-oriented.
This is a reasonable trade-off for a hot write path, but if future item-level side effects are added, the implementation may require additional care.
The runtime limits improve predictability and reduce overprovisioning risk, but they also require production monitoring.  
If limits are too aggressive in real traffic conditions, they can create throttling or restart behavior.

---

## 10. Production monitoring I would add

If this system were promoted further, I would monitor:

- p95 / p99 latency for `POST /orders`
- error rate for the endpoint
- queue publish / consume success
- DB query count or DB time per order creation
- gRPC client timeouts / retries
- CPU / memory usage for `api`, `payments`, and `worker`

---


This revision **successfully fixed correctness and data-model issues** in the main order creation flow:

- the smoke flow works;
- the payments path is corrected;
- `order_items` now persist valid foreign keys;
- runtime limits were applied and verified.


