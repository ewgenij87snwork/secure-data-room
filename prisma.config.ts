import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { resolvePrismaDatasourceUrl } from './scripts/prisma-datasource.js';

loadDotenv({ path: fileURLToPath(new URL('.env.local', import.meta.url)), quiet: true });
loadDotenv({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: resolvePrismaDatasourceUrl({ directUrl: process.env.DIRECT_URL, argv: process.argv }),
  },
});
