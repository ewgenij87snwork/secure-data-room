import { describe, expect, it, vi } from 'vitest';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { authenticatedPrincipal } from '../auth/principal.js';
import { finalizeUploadRequestSchema, prepareUploadRequestSchema, uuidSchema } from '@data-room/contracts';
import { UploadsController } from './uploads.controller.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

const principal = authenticatedPrincipal('11111111-1111-4111-8111-111111111111', 'owner@example.com');
const sessionId = '66666666-6666-4666-8666-666666666666';
const body = prepareUploadRequestSchema.parse({
  parentId: '22222222-2222-4222-8222-222222222222',
  files: [{ clientId: '55555555-5555-4555-8555-555555555555', name: 'deal.pdf', sizeBytes: 12, mimeType: 'application/pdf' }],
});

describe('UploadsController', () => {
  it('validates UUID and body at the route boundary and wires all lifecycle calls', async () => {
    const uploads = {
      prepare: vi.fn().mockResolvedValue({ uploads: [] }),
      finalize: vi.fn().mockResolvedValue({ clientId: body.files[0]!.clientId, nodeId: sessionId, finalName: 'deal.pdf', conflictResolved: false }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new UploadsController(uploads as never);
    const preparePipe = new ZodValidationPipe(prepareUploadRequestSchema);
    const uuidPipe = new ZodValidationPipe(uuidSchema);
    const finalizePipe = new ZodValidationPipe(finalizeUploadRequestSchema);

    await expect(controller.prepare(principal, preparePipe.transform(body))).resolves.toEqual({ uploads: [] });
    await expect(controller.finalize(principal, uuidPipe.transform(sessionId), finalizePipe.transform({ clientId: body.files[0]!.clientId }))).resolves.toMatchObject({ nodeId: sessionId });
    await expect(controller.cancel(principal, uuidPipe.transform(sessionId))).resolves.toBeUndefined();
    await expect(Promise.resolve().then(() => uuidPipe.transform('not-a-uuid'))).rejects.toThrow();
    await expect(Promise.resolve().then(() => preparePipe.transform({ ...body, files: [] }))).rejects.toThrow();
    expect(uploads.prepare).toHaveBeenCalledWith(principal, body);
    expect(uploads.finalize).toHaveBeenCalledWith(principal, sessionId, { clientId: body.files[0]!.clientId });
    expect(uploads.cancel).toHaveBeenCalledWith(principal, sessionId);
    expect(Reflect.getMetadata('__guards__', UploadsController)).toContain(JwtAuthGuard);
  });
});
