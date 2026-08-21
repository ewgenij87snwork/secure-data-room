import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  apiHelmetOptions,
  bootstrap,
  configureHttpSecurity,
  createServerlessHandler,
  resolveHelmetFactory,
  shouldStartStandalone,
} from './main.js';

describe('API bootstrap security', () => {
  it('normalizes callable and namespace-shaped Helmet exports', () => {
    const middleware = vi.fn();
    const factory = vi.fn(() => middleware);

    expect(resolveHelmetFactory(factory)(apiHelmetOptions)).toBe(middleware);
    expect(resolveHelmetFactory({ default: factory })(apiHelmetOptions)).toBe(middleware);
  });

  it('uses an exact CORS policy and registers graceful shutdown hooks', () => {
    const app = {
      enableShutdownHooks: vi.fn(),
      enableCors: vi.fn(),
      use: vi.fn(),
    };

    configureHttpSecurity(app as never, ['https://reviewer.example']);

    expect(app.enableShutdownHooks).toHaveBeenCalledWith(['SIGTERM', 'SIGINT']);
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['https://reviewer.example'],
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'If-Match',
        'X-Request-Id',
        'X-Share-Token',
      ],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
      credentials: false,
      maxAge: 600,
    });
    expect(apiHelmetOptions).toEqual({
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: false,
    });
    expect(app.use).toHaveBeenCalledWith(expect.any(Function));
  });

  it('closes the app and exits safely when startup fails without logging the error', async () => {
    const app = {
      close: vi.fn().mockResolvedValue(undefined),
      listen: vi.fn().mockRejectedValue(new Error('sensitive startup detail')),
    };
    const error = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;

    await bootstrap(
      () => Promise.resolve(app as never),
      () => ({ PORT: 3000 }) as never,
    );

    expect(app.close).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith('API failed to start.', 'Bootstrap');
    expect(error.mock.calls.flat().join(' ')).not.toContain('sensitive startup detail');

    process.exitCode = previousExitCode;
    error.mockRestore();
  });

  it('initializes the serverless HTTP handler once and reuses it across requests', async () => {
    const httpHandler = vi.fn();
    const createApplication = vi.fn().mockResolvedValue({
      getHttpAdapter: () => ({ getInstance: () => httpHandler }),
    });
    const handler = createServerlessHandler(createApplication as never);
    const firstRequest = {};
    const firstResponse = {};
    const secondRequest = {};
    const secondResponse = {};

    await handler(firstRequest as never, firstResponse as never);
    await handler(secondRequest as never, secondResponse as never);

    expect(createApplication).toHaveBeenCalledOnce();
    expect(httpHandler).toHaveBeenNthCalledWith(1, firstRequest, firstResponse);
    expect(httpHandler).toHaveBeenNthCalledWith(2, secondRequest, secondResponse);
  });

  it('does not start a standalone listener inside tests or Vercel', () => {
    expect(shouldStartStandalone({ NODE_ENV: 'test' })).toBe(false);
    expect(shouldStartStandalone({ NODE_ENV: 'production', VERCEL: '1' })).toBe(false);
    expect(shouldStartStandalone({ NODE_ENV: 'production' })).toBe(true);
  });
});
