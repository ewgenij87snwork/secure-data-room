import { z } from 'zod';

const apiBaseUrlSchema = z.url().refine((value) => value.endsWith('/v1/'), {
  message: 'VITE_API_BASE_URL must end in /v1/ so relative API paths resolve predictably.',
});

const publicEnvSchema = z.object({
  VITE_API_BASE_URL: apiBaseUrlSchema,
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  VITE_BUILD_SHA: z.string().min(1).default('local'),
});

export const webEnv = publicEnvSchema.parse(import.meta.env);
export const publicEnv = webEnv;
