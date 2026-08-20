import { describe, expect, it } from 'vitest';
import { ApiException } from './api-exception.js';
import { decodeCanonicalBase64Json, encodeCanonicalBase64Json } from './pagination.js';

describe('canonical pagination codec', () => {
  it('round trips canonical base64url JSON', () => {
    const encoded = encodeCanonicalBase64Json({ ok: true });
    expect(decodeCanonicalBase64Json(encoded)).toEqual({ ok: true });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  it.each(['', '!', 'e30=', 'a'.repeat(513)])('rejects non-canonical input safely', (value) => {
    const error = captureError(() => decodeCanonicalBase64Json(value));
    expect(error).toBeInstanceOf(ApiException);
    expect(error).toMatchObject({
      response: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Pagination cursor is invalid.',
        },
      },
    });
    expect(JSON.stringify(error)).not.toContain('SyntaxError');
  });

  it('rejects JSON whose base64url representation is not canonical', () => {
    const value = Buffer.from('{ "ok": true }', 'utf8').toString('base64url');
    expect(() => decodeCanonicalBase64Json(value)).toThrow(ApiException);
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
