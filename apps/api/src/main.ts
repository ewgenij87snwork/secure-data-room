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
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: false,
    }),
  );
  app.enableCors({
    origin: getAllowedOrigins(),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'If-Match', 'X-Request-Id', 'X-Share-Token'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    credentials: false,
    maxAge: 600,
  });

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

async function bootstrap(): Promise<void> {
  const env = getEnv();
  const app = await createApp();
  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(`API listening on port ${env.PORT}`, 'Bootstrap');
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
