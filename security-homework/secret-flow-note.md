# Secret handling note

## Current safe local-dev state
- secrets are not hardcoded in source code
- `.env.example` contains placeholders only
- real `.env` must stay local and out of git
- runtime reads secrets from environment variables
- DB query logging is **off by default** to reduce leakage risk

## Where secrets live
### Local development
- developer-managed `.env` file, created from `.env.example`
- never commit real credentials

### Production target state
- secret manager / Kubernetes Secret / cloud-native parameter store
- separate values for local, stage, and prod
- least-privilege access per workload

## How secrets enter runtime
### Local
1. copy `.env.example` -> `.env`
2. fill local-only values
3. run service with docker compose or `npm run start:dev`
4. app reads from process environment

### Production target
1. CI/CD injects references, not raw values into code
2. runtime receives secrets from secret manager / orchestrator
3. workloads get only the secrets they need

## What must never be logged
- raw JWT or refresh tokens
- database passwords
- cloud access keys / provider API keys
- user passwords
- full payment credentials

## Rotation strategy
### JWT signing secret / key
- keep active + next key during overlap window
- rotate by deploying new signer, accepting previous key during grace period
- revoke compromised key by removing verifier support after expiry window

### Database credentials
- use app-specific DB user
- rotate by creating new credential, updating runtime config, then revoking old one
- avoid shared superuser credentials

### AWS / integration keys
- issue per-environment credentials
- prefer short-lived credentials where possible
- rotate on schedule and immediately on suspicion of leakage

## Why `.env` is not enough
`.env` is acceptable for local development, but it is not the production secret strategy. Production should have centralized storage, access control, auditability, and a repeatable rotation/revoke process.
