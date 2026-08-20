import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  WEB_ORIGINS: z.string().default('http://localhost:5173'),
  APP_VERSION: z.string().min(1).default('local'),
  GIT_COMMIT_SHA: z.string().min(1).default('local'),
  DATABASE_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_JWKS_URL: z.url(),
  SUPABASE_JWT_ISSUER: z.url(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  STORAGE_BUCKET: z.string().min(1).default('data-room-pdfs'),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= envSchema.parse(process.env);
  return cachedEnv;
}

export function getAllowedOrigins(): string[] {
  return getEnv()
    .WEB_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
