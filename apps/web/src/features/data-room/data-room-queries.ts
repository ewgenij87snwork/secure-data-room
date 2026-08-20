import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateFolderRequest, NodeSummary } from '@data-room/contracts';
import { useAuth } from '../auth/auth-context.js';
import {
  createFolder,
  deleteNode,
  readBreadcrumbs,
  readDeleteImpact,
  readNode,
  readNodeChildren,
  renameNode,
} from './data-room-api.js';
import { nodeKeys } from './data-room-keys.js';

function requireAccessToken(accessToken: string | null): string {
  if (!accessToken) throw new Error('An authenticated access token is required.');
  return accessToken;
}

export function useNode(nodeId: string) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: nodeKeys.detail(nodeId),
    enabled: Boolean(accessToken && nodeId),
    queryFn: () => readNode(requireAccessToken(accessToken), nodeId),
  });
}

export function useNodeBreadcrumbs(nodeId: string) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: nodeKeys.breadcrumbs(nodeId),
    enabled: Boolean(accessToken && nodeId),
    queryFn: () => readBreadcrumbs(requireAccessToken(accessToken), nodeId),
  });
}

export function useNodeChildren(nodeId: string, enabled: boolean) {
  const { accessToken } = useAuth();
  return useInfiniteQuery({
    queryKey: nodeKeys.children(nodeId),
    enabled: Boolean(accessToken && nodeId && enabled),
    queryFn: ({ pageParam }) =>
      readNodeChildren(requireAccessToken(accessToken), nodeId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
  });
}

export function useCreateFolder() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFolderRequest) =>
      createFolder(requireAccessToken(accessToken), input),
    onSuccess: async (created, input) => {
      queryClient.setQueryData(nodeKeys.detail(created.id), created);
      await queryClient.invalidateQueries({ queryKey: nodeKeys.children(input.parentId) });
    },
  });
}

export type RenameNodeMutation = Readonly<{ node: NodeSummary; name: string }>;

export function useRenameNode() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ node, name }: RenameNodeMutation) =>
      renameNode(requireAccessToken(accessToken), node.id, {
        name,
        expectedRevision: node.revision,
      }),
    onSuccess: async (renamed, { node }) => {
      queryClient.setQueryData(nodeKeys.detail(renamed.id), renamed);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: nodeKeys.breadcrumbs(renamed.id) }),
        node.parentId
          ? queryClient.invalidateQueries({ queryKey: nodeKeys.children(node.parentId) })
          : Promise.resolve(),
      ]);
    },
  });
}

export function useDeleteImpact(nodeId: string, enabled: boolean) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: nodeKeys.deleteImpact(nodeId),
    enabled: Boolean(accessToken && nodeId && enabled),
    queryFn: () => readDeleteImpact(requireAccessToken(accessToken), nodeId),
  });
}

export function useDeleteNode() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (node: NodeSummary) => deleteNode(requireAccessToken(accessToken), node.id),
    onSuccess: async (_impact, node) => {
      queryClient.removeQueries({ queryKey: nodeKeys.detail(node.id), exact: true });
      queryClient.removeQueries({ queryKey: nodeKeys.children(node.id), exact: true });
      queryClient.removeQueries({ queryKey: nodeKeys.breadcrumbs(node.id), exact: true });
      queryClient.removeQueries({ queryKey: nodeKeys.deleteImpact(node.id), exact: true });
      if (node.parentId) {
        await queryClient.invalidateQueries({ queryKey: nodeKeys.children(node.parentId) });
      }
    },
  });
}
