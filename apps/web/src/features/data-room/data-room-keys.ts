export const nodeKeys = {
  all: ['nodes'] as const,
  detail: (nodeId: string) => [...nodeKeys.all, 'detail', nodeId] as const,
  children: (nodeId: string) => [...nodeKeys.all, 'children', nodeId] as const,
  breadcrumbs: (nodeId: string) => [...nodeKeys.all, 'breadcrumbs', nodeId] as const,
  deleteImpact: (nodeId: string) => [...nodeKeys.all, 'delete-impact', nodeId] as const,
};
