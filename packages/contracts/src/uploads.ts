import { z } from 'zod';
import { nodeNameSchema, uuidSchema } from './common.js';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BATCH = 10;

export const uploadFileRequestSchema = z.object({
  clientId: uuidSchema,
  name: nodeNameSchema.refine(
    (name) => name.toLocaleLowerCase('en-US').endsWith('.pdf'),
    'Only PDF files are allowed.',
  ),
  sizeBytes: z.number().int().positive().max(MAX_PDF_BYTES),
  mimeType: z.literal('application/pdf'),
});

export const prepareUploadRequestSchema = z.object({
  parentId: uuidSchema,
  files: z.array(uploadFileRequestSchema).min(1).max(MAX_UPLOAD_BATCH),
});

export const preparedUploadSchema = z.object({
  clientId: uuidSchema,
  sessionId: uuidSchema,
  storageKey: z.string().min(1).max(300),
  tusEndpoint: z.url(),
  uploadToken: z.string().min(16),
  expiresAt: z.iso.datetime({ offset: true }),
});

export const prepareUploadResponseSchema = z.object({
  uploads: z.array(preparedUploadSchema),
});

export const finalizeUploadRequestSchema = z.object({
  clientId: uuidSchema,
});

export const finalizeUploadResponseSchema = z.object({
  clientId: uuidSchema,
  nodeId: uuidSchema,
  finalName: nodeNameSchema,
  conflictResolved: z.boolean(),
});

export type PrepareUploadRequest = z.infer<typeof prepareUploadRequestSchema>;
export type PreparedUpload = z.infer<typeof preparedUploadSchema>;
export type FinalizeUploadResponse = z.infer<typeof finalizeUploadResponseSchema>;
