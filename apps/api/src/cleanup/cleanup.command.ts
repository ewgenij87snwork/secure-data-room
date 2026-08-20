import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { CleanupService } from './cleanup.service.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  const result = await app.get(CleanupService).runDueJobs();
  console.log(JSON.stringify(result));
  if (result.failed > 0) process.exitCode = 1;
} finally {
  await app.close();
}
