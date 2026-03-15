#!/usr/bin/env bash
set -euo pipefail

APP_URL="${1:-}"
if [[ -z "$APP_URL" ]]; then
  echo "Usage: $0 <app-url>"
  exit 1
fi

HEALTH_URL="${APP_URL%/}/health"
READY_URL="${APP_URL%/}/ready"

for attempt in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/tmp/health.json && curl -fsS "$READY_URL" >/tmp/ready.json; then
    echo "Health response:"
    cat /tmp/health.json
    echo
    echo "Readiness response:"
    cat /tmp/ready.json
    echo
    exit 0
  fi

  echo "Waiting for service... attempt=$attempt"
  sleep 5
done

echo "Smoke check failed for $APP_URL"
exit 1
