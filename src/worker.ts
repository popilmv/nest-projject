import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';

async function bootstrap() {
  // Application context: no HTTP server
  await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'warn', 'error'],
  });
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
