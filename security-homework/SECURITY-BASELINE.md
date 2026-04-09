# SECURITY BASELINE

## Service summary
This service exposes:
- REST API for orders and files
- GraphQL endpoint at `/graphql`
- RabbitMQ-driven async order processing
- internal gRPC payments service
- PostgreSQL persistence
- S3 presigned upload flow for files

## High-risk surface areas
| Surface area | Main risk | Before hardening | What was added | Evidence | Residual risk / backlog |
|---|---|---|---|---|---|
| `POST /orders` | forged order creation, abuse, replay | idempotency existed, but route was not bound to authenticated principal and had no stricter abuse control | DEV auth guard on route, request principal binding (`userId` forced from auth context), strict rate limit, audit logging for accepted/reused/failed writes | `security-evidence/rate-limit.txt`, `security-evidence/audit-log-example.txt` | replace dev headers with JWT/session auth; add anomaly detection |
| `POST /files/presign` | abusive uploads, privilege misuse | owner/admin checks existed, but no throttling or audit trail | strict rate limit, request/correlation ids, audit on success/failure | `security-evidence/rate-limit.txt`, `security-evidence/audit-log-example.txt` | antivirus/content validation downstream; per-user quotas |
| `POST /files/complete` | unauthorized state change | ownership check existed, but no audit or route-specific throttling | strict rate limit, audit on success/failure | `security-evidence/audit-log-example.txt` | add checksum/object existence verification |
| `GET /files/:id` | unauthorized private file access | backend ownership check for private files | audit on URL issuance/failure, request/correlation ids | `security-evidence/audit-log-example.txt` | signed CDN/private object access logs |
| `/graphql` | broad query surface, enumeration | no extra abuse controls | strict rate limit, playground disabled in production | `security-evidence/rate-limit.txt`, `tls-note.md` | authn/authz at resolver level, query complexity limits |

## Mapping to hardening categories

### 1. Authentication / Session / JWT
**Already had**
- DEV-only simulated auth via `x-user-id` / `x-user-role`

**Risk that remained**
- no evidence trail for suspicious auth input
- invalid role header was silently downgraded to `user`

**Added in this homework**
- audit logging for missing `x-user-id`
- audit logging + rejection for invalid `x-user-role`
- requestId / correlationId attached to responses and logs

**Backlog**
- replace DEV headers with real JWT/session-based auth
- add refresh/token revocation strategy

### 2. Access control / Roles / Scopes
**Already had**
- owner/admin checks in files module
- product image upload restricted to admin

**Risk that remained**
- `POST /orders` trusted `userId` from request body

**Added in this homework**
- `POST /orders` now runs behind auth guard
- controller binds `userId` to authenticated principal
- mismatched `body.userId` is explicitly denied and audited

**Backlog**
- introduce route-specific scopes/permissions instead of coarse roles only
- enforce authz consistently for GraphQL mutations

### 3. Secrets management
**Already had**
- secrets came from env, not hardcoded in source
- `.env.example` was present

**Risk that remained**
- `.env` could be treated as a final strategy
- DB query logging risked exposing sensitive values in logs

**Added in this homework**
- query logging is disabled by default and must be explicitly enabled with `DB_LOG_QUERIES=true`
- documented safe local flow and production target state in `secret-flow-note.md`
- documented no-log rules for secrets, raw JWT, passwords, payment data

**Backlog**
- move production secrets to cloud/Kubernetes secret delivery
- automate rotation and revoke procedures

### 4. Transport security / TLS
**Already had**
- Docker compose separated `public` and `internal` networks
- payments gRPC ran on internal network only

**Risk that remained**
- TLS termination design was implicit and undocumented
- no HSTS posture note for browser-facing edge

**Added in this homework**
- documented transport design in `tls-note.md`
- enabled HSTS only when `ENABLE_HSTS=true` and request arrives over HTTPS at the edge
- `trust proxy` enabled so proxied client IP and HTTPS posture are interpreted correctly

**Backlog**
- real reverse proxy / ingress with HTTP -> HTTPS redirect
- optional mTLS or service mesh for internal high-trust links

### 5. Input surface / Abuse protection
**Already had**
- DTO validation with `whitelist: true`

**Risk that remained**
- no `forbidNonWhitelisted`
- no throttling differentiation between normal and risky traffic

**Added in this homework**
- `forbidNonWhitelisted: true`
- two throttling modes:
  - default: general API traffic
  - strict: `POST /orders`, `POST /files/presign`, `POST /files/complete`, `/graphql`
- 429 responses include requestId/correlationId and standard rate-limit headers

**Backlog**
- distributed/shared rate-limit store (Redis)
- separate budgets by userId/API key in addition to IP

### 6. Logging / Auditability
**Already had**
- application logs, but not proof-grade audit events

**Risk that remained**
- no structured answer to “who did what, to which object, when, and with what outcome?”

**Added in this homework**
- structured audit events with:
  - `action`
  - `actorId`
  - `actorRole`
  - `targetType`
  - `targetId`
  - `outcome`
  - `timestamp`
  - `requestId`
  - `correlationId`
  - `ip`
  - `userAgent`
- audit examples added for at least 3 critical actions:
  - auth failure
  - order create / idempotent replay
  - file presign / complete / URL issuance

**Backlog**
- send audit events to dedicated sink / SIEM
- define retention and alerting policy

## What was the weakest point before hardening
The weakest point was `POST /orders`: the endpoint accepted a `userId` from the body and was not protected by the DEV auth guard, so request intent was not reliably bound to an authenticated principal.

## What was fixed now
- route is guarded
- body `userId` mismatch is denied
- actual order creation always uses authenticated user id
- sensitive routes now have stricter throttling
- proof-grade audit events exist for critical flows

## What intentionally remains in backlog
- real JWT/session auth instead of DEV headers
- production secret delivery and automated rotation
- HTTPS redirect and certificate management at reverse proxy / ingress
- distributed rate limiting
- webhook verification / more payment-specific hardening
