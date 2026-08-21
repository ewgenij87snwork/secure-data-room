import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context.js';
import {
  clearPublicShareToken,
  capturePublicShareToken,
  publicShareSessionGeneration,
} from '../../lib/public-token.js';
import {
  createPermissionedShare,
  createPublicShare,
  listShares,
  readPublicChildren,
  readPublicRoot,
  readSharedChildren,
  readSharedNode,
  readSharedWithMe,
  revokeShare,
} from './api.js';

const tokenKeys = { shared: ['sharing'] as const, public: ['public-share'] as const };
const requireToken = (token: string | null) => {
  if (!token) throw new Error('An authenticated access token is required.');
  return token;
};

export function useShares(nodeId: string, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: [...tokenKeys.shared, 'node', nodeId],
    enabled: Boolean(accessToken && enabled),
    queryFn: () => listShares(requireToken(accessToken), nodeId),
  });
}
export function useCreatePublicShare(nodeId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => createPublicShare(requireToken(accessToken), nodeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...tokenKeys.shared, 'node', nodeId] }),
  });
}
export function useCreatePermissionedShare(nodeId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string }) =>
      createPermissionedShare(requireToken(accessToken), nodeId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...tokenKeys.shared, 'node', nodeId] }),
  });
}
export function useRevokeShare(nodeId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) => revokeShare(requireToken(accessToken), shareId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...tokenKeys.shared, 'node', nodeId] }),
  });
}
export function useSharedWithMe() {
  const { accessToken } = useAuth();
  return useInfiniteQuery({
    queryKey: [...tokenKeys.shared, 'with-me'],
    enabled: Boolean(accessToken),
    queryFn: ({ pageParam }) => readSharedWithMe(requireToken(accessToken), pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
  });
}
export function useSharedNode(nodeId: string) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: [...tokenKeys.shared, 'detail', nodeId],
    enabled: Boolean(accessToken),
    queryFn: () => readSharedNode(requireToken(accessToken), nodeId),
  });
}
export function useSharedChildren(nodeId: string, enabled: boolean) {
  const { accessToken } = useAuth();
  return useInfiniteQuery({
    queryKey: [...tokenKeys.shared, 'children', nodeId],
    enabled: Boolean(accessToken && enabled),
    queryFn: ({ pageParam }) => readSharedChildren(requireToken(accessToken), nodeId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
  });
}
export function usePublicShare() {
  const token = capturePublicShareToken();
  const generation = publicShareSessionGeneration();
  return useQuery({
    queryKey: [...tokenKeys.public, generation, 'root'],
    enabled: Boolean(token),
    queryFn: () => readPublicRoot(token!),
    retry: false,
  });
}
export function usePublicChildren(token: string | null, nodeId: string, enabled: boolean) {
  const generation = publicShareSessionGeneration();
  return useInfiniteQuery({
    queryKey: [...tokenKeys.public, generation, 'children', nodeId],
    enabled: Boolean(token && enabled),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: ({ pageParam }) => readPublicChildren(token!, nodeId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
  });
}
export function clearPublicShareCache(): void {
  clearPublicShareToken();
}
