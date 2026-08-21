import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as helmetModule from 'helmet';
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

type HelmetFactory = (options: typeof apiHelmetOptions) => Parameters<INestApplication['use']>[0];

export function resolveHelmetFactory(moduleValue: unknown): HelmetFactory {
  const candidate =
    typeof moduleValue === 'function'
      ? moduleValue
      : typeof moduleValue === 'object' && moduleValue !== null && 'default' in moduleValue
        ? moduleValue.default
        : undefined;

  if (typeof candidate !== 'function') {
    throw new TypeError('Helmet does not expose a middleware factory.');
  }
  return candidate as HelmetFactory;
}

const helmet = resolveHelmetFactory(helmetModule);

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

type ServerlessHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>;

export function createServerlessHandler(
  createApplication: () => Promise<INestApplication> = createApp,
): ServerlessHandler {
  let handlerPromise: Promise<ServerlessHandler> | undefined;

  return async (request, response) => {
    handlerPromise ??= createApplication()
      .then((app) => {
        const handler: unknown = app.getHttpAdapter().getInstance();
        if (typeof handler !== 'function') {
          throw new TypeError('Nest HTTP adapter does not expose a request handler.');
        }
        return handler as ServerlessHandler;
      })
      .catch((error: unknown) => {
        handlerPromise = undefined;
        throw error;
      });

    const handler = await handlerPromise;
    return handler(request, response);
  };
}

export function shouldStartStandalone(
  env: Partial<Record<'NODE_ENV' | 'VERCEL', string | undefined>> = process.env,
): boolean {
  return env.NODE_ENV !== 'test' && env.VERCEL !== '1';
}

const serverlessHandler = createServerlessHandler();
export default serverlessHandler;

if (shouldStartStandalone()) {
  void bootstrap();
}
