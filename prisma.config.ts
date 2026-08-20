import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

loadDotenv({ path: fileURLToPath(new URL('.env.local', import.meta.url)), quiet: true });
loadDotenv({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
});
