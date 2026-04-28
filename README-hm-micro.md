## Happy path (end-to-end)

Call Orders create endpoint. Orders will:

1) create the order in the orders DB
2) call `Payments.Authorize` over gRPC using `PaymentsClient`
3) persist `paymentId/paymentStatus` on the order
4) return `{ reused, order, payment, messageId }`

Before calling the API, make sure you use real seed data:

```sql
SELECT id, title FROM products;
```

Use one existing `productId` from the query above. A valid demo `userId` for this homework is:

```text
00000000-0000-0000-0000-000000000001
```

Example:

```bash
curl -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: hw14-happy-1' \
  -d '{
    "userId": "00000000-0000-0000-0000-000000000001",
    "items": [
      {"productId": "<PUT_EXISTING_PRODUCT_ID>", "quantity": 1}
    ]
  }'
```

Expected response fragment:

```json
{
  "reused": false,
  "order": {
    "id": "<order-id>",
    "status": "created",
    "paymentId": "<payment-id>",
    "paymentStatus": "PAYMENT_STATUS_AUTHORIZED"
  },
  "payment": {
    "payment_id": "<payment-id>",
    "status": "PAYMENT_STATUS_AUTHORIZED"
  },
  "messageId": "<message-id>"
}
```

Repeat the same request with the same `Idempotency-Key` and the API returns the existing order with the same stored payment information (`reused: true`).

## Deadline/timeout

Orders sets a real gRPC **deadline** on `Authorize` using `PAYMENTS_GRPC_TIMEOUT_MS`.
If payments-service is slow/unavailable, Orders maps the transport error to a controlled HTTP error:

- `504 GATEWAY_TIMEOUT` for `DEADLINE_EXCEEDED`
- `503 SERVICE_UNAVAILABLE` for unavailable/other RPC failures

Example negative test:

1) stop `payments-service`
2) call `POST /orders`
3) expect `503` or `504`
4) verify the order is marked as `failed` in DB

This prevents raw gRPC transport leakage in the public HTTP API.
