import { describe, expect, it } from 'vitest';
import { createFolderRequestSchema } from '@data-room/contracts';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const parentId = '11111111-1111-4111-8111-111111111111';

describe('ZodValidationPipe', () => {
  it('returns normalized create-folder input and hides validation internals', () => {
    const pipe = new ZodValidationPipe(createFolderRequestSchema);

    expect(pipe.transform({ parentId, name: '  Ｌｅｇａｌ  ' })).toEqual({
      parentId,
      name: 'Legal',
    });
    expect(() => pipe.transform({ parentId, name: '../Legal' })).toThrowError(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        response: { error: expect.objectContaining({ code: 'VALIDATION_FAILED' }) },
      }),
    );
  });
});
