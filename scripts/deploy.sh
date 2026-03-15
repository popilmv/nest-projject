#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-}"
if [[ -z "$ENVIRONMENT" ]]; then
  echo "Usage: $0 <stage|production>"
  exit 1
fi

: "${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME is required}"
: "${ENV_FILE:?ENV_FILE is required}"
: "${ORDERS_API_IMAGE:?ORDERS_API_IMAGE is required}"
: "${PAYMENTS_IMAGE:?PAYMENTS_IMAGE is required}"
: "${WORKER_IMAGE:?WORKER_IMAGE is required}"
: "${APP_URL:?APP_URL is required}"

COMPOSE_FILE="ops/compose.deploy.yml"

echo "Deploying environment=$ENVIRONMENT"
echo "project=$COMPOSE_PROJECT_NAME"
echo "orders_api_image=$ORDERS_API_IMAGE"
echo "payments_image=$PAYMENTS_IMAGE"
echo "worker_image=$WORKER_IMAGE"

docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" pull
docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" up -d postgres rabbitmq

echo "Running database migrations"
docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" run --rm migrate

echo "Starting application workloads"
docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" up -d orders-api payments worker

./scripts/smoke-check.sh "$APP_URL"

docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" ps
