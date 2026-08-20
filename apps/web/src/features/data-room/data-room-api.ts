import {
  createFolderRequestSchema,
  deleteImpactSchema,
  finalizeUploadRequestSchema,
  finalizeUploadResponseSchema,
  listNodeChildrenResponseSchema,
  nodeBreadcrumbsResponseSchema,
  nodeSummarySchema,
  moveFileRequestSchema,
  prepareUploadRequestSchema,
  prepareUploadResponseSchema,
  renameNodeRequestSchema,
  type CreateFolderRequest,
  type DeleteImpact,
  type ListNodeChildrenResponse,
  type NodeBreadcrumbsResponse,
  type NodeSummary,
  type RenameNodeRequest,
  type PrepareUploadRequest,
  type PreparedUpload,
  type FinalizeUploadResponse,
} from '@data-room/contracts';
import { z } from 'zod';
import { apiRequest } from '../../lib/api-client.js';

const viewUrlResponseSchema = z.object({ url: z.string().url(), expiresAt: z.string().datetime() });
type MoveFileRequest = z.infer<typeof moveFileRequestSchema>;

export async function readNode(accessToken: string, nodeId: string): Promise<NodeSummary> {
  const response = await apiRequest<unknown>(`/nodes/${nodeId}`, { accessToken });
  return nodeSummarySchema.parse(response);
}

export async function readBreadcrumbs(
  accessToken: string,
  nodeId: string,
): Promise<NodeBreadcrumbsResponse> {
  const response = await apiRequest<unknown>(`/nodes/${nodeId}/breadcrumbs`, { accessToken });
  return nodeBreadcrumbsResponseSchema.parse(response);
}

export async function readNodeChildren(
  accessToken: string,
  nodeId: string,
  cursor?: string,
): Promise<ListNodeChildrenResponse> {
  const query = new URLSearchParams({ limit: '50' });
  if (cursor) query.set('cursor', cursor);
  const response = await apiRequest<unknown>(`/nodes/${nodeId}/children?${query.toString()}`, {
    accessToken,
  });
  return listNodeChildrenResponseSchema.parse(response);
}

export async function createFolder(
  accessToken: string,
  input: CreateFolderRequest,
): Promise<NodeSummary> {
  const response = await apiRequest<unknown>('/folders', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(createFolderRequestSchema.parse(input)),
  });
  return nodeSummarySchema.parse(response);
}

export async function renameNode(
  accessToken: string,
  nodeId: string,
  input: RenameNodeRequest,
): Promise<NodeSummary> {
  const response = await apiRequest<unknown>(`/nodes/${nodeId}/name`, {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(renameNodeRequestSchema.parse(input)),
  });
  return nodeSummarySchema.parse(response);
}

export async function readDeleteImpact(accessToken: string, nodeId: string): Promise<DeleteImpact> {
  const response = await apiRequest<unknown>(`/nodes/${nodeId}/delete-impact`, { accessToken });
  return deleteImpactSchema.parse(response);
}

export async function deleteNode(accessToken: string, nodeId: string): Promise<DeleteImpact> {
  const response = await apiRequest<unknown>(`/nodes/${nodeId}`, {
    method: 'DELETE',
    accessToken,
  });
  return deleteImpactSchema.parse(response);
}

export async function moveNode(
  accessToken: string,
  nodeId: string,
  input: MoveFileRequest,
): Promise<NodeSummary> {
  const response = await apiRequest<unknown>(`/files/${nodeId}/move`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify(moveFileRequestSchema.parse(input)),
  });
  return nodeSummarySchema.parse(response);
}

export async function readFileViewUrl(
  accessToken: string,
  nodeId: string,
): Promise<{ url: string; expiresAt: string }> {
  const response = await apiRequest<unknown>(`/files/${nodeId}/view-url`, {
    method: 'POST',
    accessToken,
  });
  return viewUrlResponseSchema.parse(response);
}

export async function prepareUploads(
  accessToken: string,
  input: PrepareUploadRequest,
): Promise<readonly PreparedUpload[]> {
  const response = await apiRequest<unknown>('/uploads/prepare', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(prepareUploadRequestSchema.parse(input)),
  });
  return prepareUploadResponseSchema.parse(response).uploads;
}

export async function finalizeUpload(
  accessToken: string,
  sessionId: string,
  clientId: string,
): Promise<FinalizeUploadResponse> {
  const response = await apiRequest<unknown>(`/uploads/${sessionId}/finalize`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify(finalizeUploadRequestSchema.parse({ clientId })),
  });
  return finalizeUploadResponseSchema.parse(response);
}

export async function cancelUpload(accessToken: string, sessionId: string): Promise<void> {
  await apiRequest<void>(`/uploads/${sessionId}`, { method: 'DELETE', accessToken });
}
