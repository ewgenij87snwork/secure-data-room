import { z } from 'zod';

function containsAsciiControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

export const uuidSchema = z.uuid();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const cursorSchema = z.string().min(1).max(512);
export const byteCountSchema = z.string().regex(/^(0|[1-9]\d*)$/, 'Expected a decimal byte count.');

export const nodeNameSchema = z
  .string()
  .transform((value) => value.normalize('NFKC').trim())
  .pipe(z.string().min(1).max(120))
  .refine((value) => !containsAsciiControlCharacter(value), 'Control characters are not allowed.')
  .refine((value) => !/[\\/]/u.test(value), 'Slash characters are not allowed.');

export const pageLimitSchema = z.coerce.number().int().min(1).max(100).default(50);

export const paginationQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: pageLimitSchema,
});

export const pageInfoSchema = z.object({
  nextCursor: cursorSchema.nullable(),
  hasNextPage: z.boolean(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PageInfo = z.infer<typeof pageInfoSchema>;
