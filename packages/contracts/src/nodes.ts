import { z } from 'zod';
import {
  byteCountSchema,
  isoDateTimeSchema,
  nodeNameSchema,
  pageInfoSchema,
  uuidSchema,
} from './common.js';

export const nodeKindSchema = z.enum(['FOLDER', 'FILE']);
export const accessRoleSchema = z.enum(['OWNER', 'VIEWER', 'EDITOR']);

export const nodeSummarySchema = z.object({
  id: uuidSchema,
  dataRoomId: uuidSchema,
  parentId: uuidSchema.nullable(),
  kind: nodeKindSchema,
  name: nodeNameSchema,
  sizeBytes: byteCountSchema.nullable(),
  mimeType: z.literal('application/pdf').nullable(),
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  isShared: z.boolean(),
  accessRole: accessRoleSchema,
});

export const breadcrumbItemSchema = z.object({
  id: uuidSchema,
  name: nodeNameSchema,
});

export const listNodesResponseSchema = z.object({
  current: nodeSummarySchema,
  breadcrumbs: z.array(breadcrumbItemSchema),
  items: z.array(nodeSummarySchema),
  pageInfo: pageInfoSchema,
});

export const listNodeChildrenResponseSchema = z.object({
  items: z.array(nodeSummarySchema),
  pageInfo: pageInfoSchema,
});

export const createFolderRequestSchema = z.object({
  parentId: uuidSchema,
  name: nodeNameSchema,
});

export const renameNodeRequestSchema = z.object({
  name: nodeNameSchema,
  expectedRevision: z.number().int().positive(),
});

export const moveFileRequestSchema = z.object({
  targetFolderId: uuidSchema,
  expectedRevision: z.number().int().positive(),
});

export const deleteImpactSchema = z.object({
  rootNodeId: uuidSchema,
  folderCount: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: byteCountSchema,
  activeShareCount: z.number().int().nonnegative(),
});

export type NodeKind = z.infer<typeof nodeKindSchema>;
export type AccessRole = z.infer<typeof accessRoleSchema>;
export type NodeSummary = z.infer<typeof nodeSummarySchema>;
export type ListNodesResponse = z.infer<typeof listNodesResponseSchema>;
export type ListNodeChildrenResponse = z.infer<typeof listNodeChildrenResponseSchema>;
export type CreateFolderRequest = z.infer<typeof createFolderRequestSchema>;
export type DeleteImpact = z.infer<typeof deleteImpactSchema>;
