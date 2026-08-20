import { describe, expect, it } from 'vitest';
import {
  MAX_PDF_BYTES,
  apiErrorCodeSchema,
  byteCountSchema,
  nodeNameSchema,
  prepareUploadRequestSchema,
} from './index.js';

describe('shared contracts', () => {
  it('normalizes user-visible names once at the boundary', () => {
    expect(nodeNameSchema.parse('  Ｌｅｇａｌ  ')).toBe('Legal');
  });

  it('rejects path-like and control-character names', () => {
    expect(() => nodeNameSchema.parse('../Contracts')).toThrow();
    expect(() => nodeNameSchema.parse('Bad\u0000Name')).toThrow();
  });

  it('serializes database bigint byte counts as decimal strings', () => {
    expect(byteCountSchema.parse('10485760')).toBe('10485760');
    expect(() => byteCountSchema.parse('10.5')).toThrow();
  });

  it('enforces PDF batch boundaries', () => {
    const request = {
      parentId: '550e8400-e29b-41d4-a716-446655440000',
      files: [
        {
          clientId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
          name: 'Agreement.pdf',
          sizeBytes: MAX_PDF_BYTES,
          mimeType: 'application/pdf',
        },
      ],
    } as const;

    expect(prepareUploadRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      prepareUploadRequestSchema.parse({
        ...request,
        files: [{ ...request.files[0], sizeBytes: MAX_PDF_BYTES + 1 }],
      }),
    ).toThrow();
  });

  it('keeps error codes stable and machine-readable', () => {
    expect(apiErrorCodeSchema.parse('NAME_CONFLICT')).toBe('NAME_CONFLICT');
    expect(() => apiErrorCodeSchema.parse('Something went wrong')).toThrow();
  });
});
