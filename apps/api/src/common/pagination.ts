import { HttpStatus } from '@nestjs/common';
import { ApiException } from './api-exception.js';

const alphabet = /^[A-Za-z0-9_-]+$/u;
const invalidCursor = () =>
  new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Pagination cursor is invalid.');

export function encodeCanonicalBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCanonicalBase64Json(value: string): unknown {
  try {
    if (value.length === 0 || value.length > 512 || !alphabet.test(value)) throw invalidCursor();
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(decoded);
    if (encodeCanonicalBase64Json(parsed) !== value) throw invalidCursor();
    return parsed;
  } catch {
    throw invalidCursor();
  }
}
