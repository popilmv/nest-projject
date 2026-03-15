import { AppDataSource } from './data-source';

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * One-off DB job.
 * In this project we use `synchronize: true` (dev-friendly schema sync).
 * This script exists to match a "migrate" job flow in Docker/CI.
 *
 * If you later switch to real TypeORM migrations, replace the body with:
 *  - AppDataSource.runMigrations()
 */
async function run() {
  // Basic retry to give Postgres time to accept connections
  const maxAttempts = Number(process.env.DB_CONNECT_RETRIES ?? 20);
  const delayMs = Number(process.env.DB_CONNECT_RETRY_DELAY_MS ?? 1000);

  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await AppDataSource.initialize();
      // schema sync happens on initialize when `synchronize: true`
      await AppDataSource.destroy();
      console.log('Migrate (schema sync) done');
      return;
    } catch (e) {
      lastErr = e;
      console.warn(
        `Migrate attempt ${attempt}/${maxAttempts} failed. Retrying in ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }

  console.error('Migrate failed after retries');
  throw lastErr;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
