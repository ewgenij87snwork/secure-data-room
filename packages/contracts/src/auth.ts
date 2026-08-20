import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

export const userProfileSchema = z.object({
  id: uuidSchema,
  email: z.email().max(254),
  displayName: z.string().max(120).nullable(),
});

export const bootstrapResponseSchema = z.object({
  user: userProfileSchema,
  room: z.object({
    id: uuidSchema,
    name: z.string().min(1).max(120),
    rootNodeId: uuidSchema,
    createdAt: isoDateTimeSchema,
  }),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
