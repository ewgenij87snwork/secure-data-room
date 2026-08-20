import { z } from 'zod';
import { userProfileSchema } from './auth.js';
import { isoDateTimeSchema, nodeNameSchema, uuidSchema } from './common.js';
import { nodeSummarySchema } from './nodes.js';

export const shareRoleSchema = z.enum(['VIEWER', 'EDITOR']);
export const sharePrincipalTypeSchema = z.enum(['USER', 'PUBLIC_LINK']);

export const createPermissionedShareRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    role: z.literal('VIEWER').default('VIEWER'),
  })
  .strict();

export const createPublicShareRequestSchema = z.object({}).strict();

export const publicShareTokenHeaderSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u,
    'Expected a canonical unpadded base64url encoding of exactly 32 bytes.',
  );

const publicShareUrlSchema = z.url().refine((value) => {
  return /^https?:\/\/[^/?#@]+\/share#token=[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u.test(value);
}, 'Public share tokens must be transported in the URL fragment.');

export const createPublicShareResponseSchema = z.object({
  shareId: uuidSchema,
  url: publicShareUrlSchema,
  targetName: nodeNameSchema,
});

export const shareSummarySchema = z.object({
  id: uuidSchema,
  targetNodeId: uuidSchema,
  targetName: nodeNameSchema,
  principalType: sharePrincipalTypeSchema,
  role: shareRoleSchema,
  recipientEmail: z.email().nullable(),
  createdAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable(),
});

export const createPermissionedShareResponseSchema = shareSummarySchema;

export const listSharesResponseSchema = z.object({
  items: z.array(shareSummarySchema),
});

export const revokeShareResponseSchema = z.object({
  shareId: uuidSchema,
  revoked: z.literal(true),
});

export const sharedWithMeItemSchema = z.object({
  share: shareSummarySchema,
  node: nodeSummarySchema,
  owner: userProfileSchema,
});

export const sharedWithMeResponseSchema = z.object({
  items: z.array(sharedWithMeItemSchema),
  pageInfo: z.object({
    nextCursor: z.string().min(1).max(512).nullable(),
    hasNextPage: z.boolean(),
  }),
});

export const publicShareNodeResponseSchema = nodeSummarySchema.extend({
  accessRole: z.literal('VIEWER'),
});

export const publicShareChildrenResponseSchema = z.object({
  items: z.array(publicShareNodeResponseSchema),
  pageInfo: z.object({
    nextCursor: z.string().min(1).max(512).nullable(),
    hasNextPage: z.boolean(),
  }),
});

export const sharedNodeResponseSchema = publicShareNodeResponseSchema;

export type ShareSummary = z.infer<typeof shareSummarySchema>;
export type SharedWithMeItem = z.infer<typeof sharedWithMeItemSchema>;
export type CreatePermissionedShareRequest = z.infer<typeof createPermissionedShareRequestSchema>;
export type CreatePublicShareRequest = z.infer<typeof createPublicShareRequestSchema>;
export type CreatePermissionedShareResponse = z.infer<typeof createPermissionedShareResponseSchema>;
export type CreatePublicShareResponse = z.infer<typeof createPublicShareResponseSchema>;
export type ListSharesResponse = z.infer<typeof listSharesResponseSchema>;
export type RevokeShareResponse = z.infer<typeof revokeShareResponseSchema>;
export type SharedWithMeResponse = z.infer<typeof sharedWithMeResponseSchema>;
export type PublicShareNodeResponse = z.infer<typeof publicShareNodeResponseSchema>;
