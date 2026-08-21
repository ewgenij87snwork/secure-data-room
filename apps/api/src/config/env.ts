import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  WEB_ORIGINS: z.string().default('http://localhost:5173'),
  APP_VERSION: z.string().min(1).default('local'),
  GIT_COMMIT_SHA: z.string().min(1).default('local'),
  DATABASE_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_JWT_ISSUER: z.url(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  STORAGE_BUCKET: z.string().min(1).default('data-room-pdfs'),
});

export type AppEnv = z.infer<typeof envSchema>;

type BuildCommitEnvironment = Partial<
  Record<'GIT_COMMIT_SHA' | 'VERCEL_GIT_COMMIT_SHA', string | undefined>
>;

export function resolveBuildCommitSha(env: BuildCommitEnvironment): string {
  return env.VERCEL_GIT_COMMIT_SHA ?? env.GIT_COMMIT_SHA ?? 'local';
}

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= envSchema.parse({
    ...process.env,
    GIT_COMMIT_SHA: resolveBuildCommitSha(process.env),
  });
  return cachedEnv;
}

export function getAllowedOrigins(): string[] {
  return parseAllowedOrigins(getEnv().WEB_ORIGINS);
}

export function parseAllowedOrigins(value: string): string[] {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) throw new Error('WEB_ORIGINS must contain an origin.');

  return origins.map((origin) => {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error('WEB_ORIGINS must contain exact HTTP(S) origins.');
    }
    return parsed.origin;
  });
}
