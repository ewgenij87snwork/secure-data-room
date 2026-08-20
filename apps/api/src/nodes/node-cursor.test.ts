import { describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception.js';
import { encodeCanonicalBase64Json } from '../common/pagination.js';
import { decodeNodeCursor, encodeNodeCursor } from './node-cursor.js';

const tuple = {
  kind: 'FILE' as const,
  normalizedName: 'alpha.pdf',
  id: '550e8400-e29b-41d4-a716-446655440000',
};
describe('node cursor', () => {
  it('preserves and freezes an exact tuple', () => {
    const decoded = decodeNodeCursor(encodeNodeCursor(tuple));
    expect(decoded).toEqual(tuple);
    expect(Object.isFrozen(decoded)).toBe(true);
  });

  it.each([
    '!',
    'eyJraW5kIjoiRklMRSJ9=',
    'not-json',
    'a'.repeat(513),
    encodeCanonicalBase64Json([]),
    encodeCanonicalBase64Json({ ...tuple, version: 2 }),
    encodeCanonicalBase64Json({ ...tuple, kind: 'LINK' }),
    encodeCanonicalBase64Json({ ...tuple, id: 'bad' }),
    encodeCanonicalBase64Json({ kind: tuple.kind, id: tuple.id }),
  ])('rejects malformed cursor %s safely', (value) => {
    const error = captureError(() => decodeNodeCursor(value));
    expect(error).toBeInstanceOf(ApiException);
    expect(error).toMatchObject({
      response: { error: { code: 'VALIDATION_FAILED', message: 'Pagination cursor is invalid.' } },
    });
    expect(JSON.stringify(error)).not.toContain('ZodError');
  });

  it('rejects extra fields', () => {
    expect(() => decodeNodeCursor(encodeCanonicalBase64Json({ ...tuple, extra: true }))).toThrow(
      ApiException,
    );
  });
});

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}
