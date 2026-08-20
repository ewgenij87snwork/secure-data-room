import 'reflect-metadata';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { getAllowedOrigins, getEnv } from './config/env.js';

export async function createApp(): Promise<INestApplication> {
  const env = getEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix('v1');
  configureHttpSecurity(app, getAllowedOrigins());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Secure Data Room API')
    .setDescription('The sole application backend for the Secure Data Room MVP.')
    .setVersion(env.APP_VERSION)
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  await app.init();
  return app;
}

export const apiHelmetOptions = {
  crossOriginResourcePolicy: { policy: 'same-site' as const },
  contentSecurityPolicy: false,
};

export function configureHttpSecurity(app: INestApplication, allowedOrigins: string[]): void {
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  app.use(helmet(apiHelmetOptions));
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'If-Match', 'X-Request-Id', 'X-Share-Token'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    credentials: false,
    maxAge: 600,
  });
}

export async function bootstrap(
  createApplication: () => Promise<INestApplication> = createApp,
  readEnv: typeof getEnv = getEnv,
): Promise<void> {
  let app: INestApplication | undefined;
  try {
    const env = readEnv();
    app = await createApplication();
    await app.listen(env.PORT, '0.0.0.0');
    Logger.log(`API listening on port ${env.PORT}`, 'Bootstrap');
  } catch {
    await app?.close().catch(() => undefined);
    Logger.error('API failed to start.', 'Bootstrap');
    process.exitCode = 1;
  }
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
