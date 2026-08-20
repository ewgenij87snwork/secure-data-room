const generationPlaceholder = 'postgresql://postgres@127.0.0.1:5432/postgres';

interface PrismaDatasourceInput {
  directUrl: string | undefined;
  argv: readonly string[];
}

export function resolvePrismaDatasourceUrl({ directUrl, argv }: PrismaDatasourceInput): string {
  if (directUrl?.trim()) return directUrl;
  if (argv.includes('generate')) return generationPlaceholder;
  throw new Error('DIRECT_URL is required for Prisma database commands.');
}
