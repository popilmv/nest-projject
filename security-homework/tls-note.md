# Transport / TLS posture

## Intended transport design
- public traffic reaches reverse proxy / ingress first
- TLS terminates at the edge
- API trusts the reverse proxy (`trust proxy` enabled)
- internal services (Postgres, RabbitMQ, payments gRPC) stay on internal network

## Public vs internal traffic
### Public
- HTTP API exposed to clients
- browser-facing or external API consumers

### Internal
- Postgres
- RabbitMQ
- payments gRPC
- container-to-container traffic on Docker internal network

## Current repo posture
- `compose.yml` uses separate `public` and `internal` Docker networks
- `payments` service is internal-only
- `postgres` is internal-only in prod-like compose
- API is the main public entrypoint

## TLS termination
This repo does not ship a real reverse proxy config, so TLS is described as intended design:
1. edge terminates TLS
2. edge forwards traffic to API
3. API reads `x-forwarded-proto` and trusted client IP from the proxy
4. HSTS can be enabled only when edge truly serves HTTPS (`ENABLE_HSTS=true`)

## HTTP -> HTTPS redirect
Target production state:
- redirect at reverse proxy / ingress
- HSTS enabled for browser-facing domains after HTTPS is stable

## Important caveat
TLS protects the channel. It does **not** replace authorization, secret handling, or audit controls.
