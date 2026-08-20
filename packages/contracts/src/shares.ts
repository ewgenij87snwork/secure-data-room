import { z } from 'zod';
import { isoDateTimeSchema, nodeNameSchema, uuidSchema } from './common.js';
import { nodeSummarySchema } from './nodes.js';

export const shareRoleSchema = z.enum(['VIEWER', 'EDITOR']);
export const sharePrincipalTypeSchema = z.enum(['USER', 'PUBLIC_LINK']);

export const createPermissionedShareRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role: z.literal('VIEWER').default('VIEWER'),
});

export const createPublicShareResponseSchema = z.object({
  shareId: uuidSchema,
  url: z.url(),
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

export const sharedWithMeItemSchema = z.object({
  share: shareSummarySchema,
  node: nodeSummarySchema,
});

export const publicShareReadRequestSchema = z.object({
  token: z.string().min(40).max(256),
});

export type ShareSummary = z.infer<typeof shareSummarySchema>;
export type SharedWithMeItem = z.infer<typeof sharedWithMeItemSchema>;
