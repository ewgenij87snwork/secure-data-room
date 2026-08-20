import {
  createPermissionedShareRequestSchema,
  createPermissionedShareResponseSchema,
  createPublicShareRequestSchema,
  createPublicShareResponseSchema,
  listSharesResponseSchema,
  publicShareChildrenResponseSchema,
  publicShareNodeResponseSchema,
  revokeShareResponseSchema,
  sharedWithMeResponseSchema,
  type CreatePublicShareResponse,
  type ListSharesResponse,
  type PublicShareNodeResponse,
  type RevokeShareResponse,
  type ShareSummary,
  type SharedWithMeResponse,
} from '@data-room/contracts';
import { z } from 'zod';
import { apiRequest } from '../../lib/api-client.js';

// Every response is parsed at this boundary with the shared contracts.
export type {
  CreatePublicShareResponse,
  ListSharesResponse,
  PublicShareNodeResponse,
  RevokeShareResponse,
  ShareSummary,
  SharedWithMeResponse,
};
export type PublicShareChildrenResponse = z.infer<typeof publicShareChildrenResponseSchema>;
export type SharedWithMeItem = SharedWithMeResponse['items'][number];
const viewUrlResponseSchema = z.object({ url: z.string().url(), expiresAt: z.string().datetime() });
export type PublicFileViewUrl = z.infer<typeof viewUrlResponseSchema>;

export async function listShares(accessToken: string, nodeId: string): Promise<ListSharesResponse> {
  return listSharesResponseSchema.parse(
    await apiRequest<unknown>(`/nodes/${nodeId}/shares`, { accessToken }),
  );
}
export async function createPublicShare(
  accessToken: string,
  nodeId: string,
): Promise<CreatePublicShareResponse> {
  return createPublicShareResponseSchema.parse(
    await apiRequest<unknown>(`/nodes/${nodeId}/shares/public`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify(createPublicShareRequestSchema.parse({})),
    }),
  );
}
export async function createPermissionedShare(
  accessToken: string,
  nodeId: string,
  input: { email: string },
): Promise<ShareSummary> {
  const body = createPermissionedShareRequestSchema.parse({ ...input, role: 'VIEWER' });
  return createPermissionedShareResponseSchema.parse(
    await apiRequest<unknown>(`/nodes/${nodeId}/shares/users`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify(body),
    }),
  );
}
export async function revokeShare(
  accessToken: string,
  shareId: string,
): Promise<RevokeShareResponse> {
  return revokeShareResponseSchema.parse(
    await apiRequest<unknown>(`/shares/${shareId}`, { method: 'DELETE', accessToken }),
  );
}
export async function readSharedWithMe(
  accessToken: string,
  cursor?: string,
): Promise<SharedWithMeResponse> {
  return sharedWithMeResponseSchema.parse(
    await apiRequest<unknown>(
      `/shared-with-me${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      {
        accessToken,
      },
    ),
  );
}
export async function readSharedNode(
  accessToken: string,
  nodeId: string,
): Promise<PublicShareNodeResponse> {
  return publicShareNodeResponseSchema.parse(
    await apiRequest<unknown>(`/nodes/${nodeId}`, { accessToken }),
  );
}
export async function readSharedChildren(
  accessToken: string,
  nodeId: string,
  cursor?: string,
): Promise<PublicShareChildrenResponse> {
  const response = await apiRequest<unknown>(
    `/nodes/${nodeId}/children${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    { accessToken },
  );
  return publicShareChildrenResponseSchema.parse(response);
}
export async function readPublicRoot(shareToken: string): Promise<PublicShareNodeResponse> {
  return publicShareNodeResponseSchema.parse(
    await apiRequest<unknown>('/public-share/root', { shareToken }),
  );
}
export async function readPublicChildren(
  shareToken: string,
  nodeId: string,
  cursor?: string,
): Promise<PublicShareChildrenResponse> {
  const response = await apiRequest<unknown>(
    `/public-share/nodes/${nodeId}/children${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    { shareToken },
  );
  return publicShareChildrenResponseSchema.parse(response);
}

export async function readPublicFileViewUrl(
  shareToken: string,
  nodeId: string,
): Promise<PublicFileViewUrl> {
  return viewUrlResponseSchema.parse(
    await apiRequest<unknown>(`/public-share/files/${nodeId}/view-url`, {
      method: 'POST',
      shareToken,
    }),
  );
}
