import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';

const URL = process.env.URL || 'http://localhost:8080/orders';
const USER_ID = process.env.USER_ID;
const PRODUCT_IDS = (process.env.PRODUCT_IDS || '').split(',').filter(Boolean);
const ITEMS_PER_ORDER = Number(process.env.ITEMS_PER_ORDER || 20);
const TOTAL_REQUESTS = Number(process.env.TOTAL_REQUESTS || 200);
const CONCURRENCY = Number(process.env.CONCURRENCY || 20);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 10000);

if (!USER_ID) {
  throw new Error('USER_ID is required');
}
if (PRODUCT_IDS.length === 0) {
  throw new Error('PRODUCT_IDS is required, e.g. PRODUCT_IDS=id1,id2');
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function buildBody() {
  const items = Array.from({ length: ITEMS_PER_ORDER }, (_, i) => ({
    productId: PRODUCT_IDS[i % PRODUCT_IDS.length],
    quantity: 1,
  }));

  return JSON.stringify({
    userId: USER_ID,
    items,
  });
}

async function sendOne() {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: buildBody(),
      signal: controller.signal,
    });

    const ended = performance.now();

    return {
      ms: ended - started,
      ok: res.ok,
      status: res.status,
    };
  } catch (err) {
    const ended = performance.now();

    return {
      ms: ended - started,
      ok: false,
      status: err?.name === 'AbortError' ? 408 : 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const results = [];
  let inFlight = 0;
  let completed = 0;
  let launched = 0;

  const globalStart = performance.now();

  await new Promise((resolve) => {
    const pump = () => {
      while (inFlight < CONCURRENCY && launched < TOTAL_REQUESTS) {
        launched++;
        inFlight++;

        sendOne()
          .then((r) => results.push(r))
          .catch(() =>
            results.push({
              ms: 0,
              ok: false,
              status: 0,
            }),
          )
          .finally(() => {
            inFlight--;
            completed++;

            if (completed === TOTAL_REQUESTS) {
              resolve();
            } else {
              pump();
            }
          });
      }
    };

    pump();
  });

  const globalEnd = performance.now();
  const totalSec = Math.max((globalEnd - globalStart) / 1000, 0.001);

  const durations = results
    .map((r) => r.ms)
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);

  const errors = results.filter((r) => !r.ok).length;

  const report = {
    totalRequests: TOTAL_REQUESTS,
    concurrency: CONCURRENCY,
    itemsPerOrder: ITEMS_PER_ORDER,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    throughputRps: Number((TOTAL_REQUESTS / totalSec).toFixed(2)),
    errorRatePct: Number(((errors / TOTAL_REQUESTS) * 100).toFixed(2)),
    p50Ms: Number(percentile(durations, 50).toFixed(2)),
    p95Ms: Number(percentile(durations, 95).toFixed(2)),
    p99Ms: Number(percentile(durations, 99).toFixed(2)),
    minMs: Number((durations[0] ?? 0).toFixed(2)),
    maxMs: Number((durations[durations.length - 1] ?? 0).toFixed(2)),
    successCount: results.filter((r) => r.ok).length,
    failureCount: errors,
    statusCounts: results.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {}),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});