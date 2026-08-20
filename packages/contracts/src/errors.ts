import { z } from 'zod';

export const apiErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'ACCESS_DENIED',
  'RESOURCE_NOT_FOUND',
  'RESOURCE_GONE',
  'NAME_CONFLICT',
  'CONFLICT',
  'INVALID_PARENT',
  'INVALID_FILE',
  'QUOTA_EXCEEDED',
  'UPLOAD_EXPIRED',
  'UPLOAD_NOT_READY',
  'SHARE_REVOKED',
  'PUBLIC_LINK_INVALID',
  'REGISTRATION_CLOSED',
  'UPLOADS_DISABLED',
  'PUBLIC_LINKS_DISABLED',
  'MAINTENANCE_MODE',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.uuid(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
