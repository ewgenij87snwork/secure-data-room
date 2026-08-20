import { HttpStatus } from '@nestjs/common';
import { nodeKindSchema, uuidSchema } from '@data-room/contracts';
import { z } from 'zod';
import { ApiException } from '../common/api-exception.js';
import { decodeCanonicalBase64Json, encodeCanonicalBase64Json } from '../common/pagination.js';

const nodeCursorSchema = z
  .object({
    kind: nodeKindSchema,
    normalizedName: z.string().min(1).max(120),
    id: uuidSchema,
  })
  .strict();

export type NodeCursor = Readonly<z.infer<typeof nodeCursorSchema>>;

export function encodeNodeCursor(cursor: NodeCursor): string {
  return encodeCanonicalBase64Json(nodeCursorSchema.parse(cursor));
}

export function decodeNodeCursor(value: string): NodeCursor {
  try {
    const parsed = nodeCursorSchema.parse(decodeCanonicalBase64Json(value));
    return Object.freeze(parsed);
  } catch (error) {
    if (error instanceof ApiException) throw error;
    throw new ApiException(
      'VALIDATION_FAILED',
      HttpStatus.BAD_REQUEST,
      'Pagination cursor is invalid.',
    );
  }
}
