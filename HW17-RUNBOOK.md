# HW17 runbook

## Stage environment
Create environment `stage` and add:

### Secrets
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `AWS_ACCESS_KEY_ID` (optional)
- `AWS_SECRET_ACCESS_KEY` (optional)

### Variables
- `NODE_ENV=stage`
- `DB_HOST=postgres`
- `DB_PORT=5432`
- `RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672`
- `APP_URL=http://localhost:18080`
- `API_PORT=18080`
- `RABBITMQ_MANAGEMENT_PORT=15672`
- `AWS_REGION=<your-region>`
- `S3_BUCKET=<your-bucket>`

## Production environment
Create environment `production` and add the same keys with production values.
Recommended variables:
- `NODE_ENV=production`
- `DB_HOST=postgres`
- `DB_PORT=5432`
- `RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672`
- `APP_URL=http://localhost:28080`
- `API_PORT=28080`
- `RABBITMQ_MANAGEMENT_PORT=25672`

## Verification flow
1. Push to `develop` and wait for `build-and-stage`.
2. Confirm stage deploy passes smoke-check.
3. Open `deploy-prod` and use values from the successful stage run:
   - `image_tag`: `sha-<full commit sha>`
   - `commit_sha`: `<full commit sha>`
   - `image_digest`: optional `sha256:...`
4. Approve the production deployment in GitHub Environment review.
