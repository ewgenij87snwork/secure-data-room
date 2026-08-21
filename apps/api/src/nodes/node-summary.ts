import type { AccessRole, NodeSummary } from '@data-room/contracts';

export interface NodeRow {
  id: string;
  dataRoomId: string;
  parentId: string | null;
  kind: 'FOLDER' | 'FILE';
  name: string;
  normalizedName: string;
  sizeBytes: bigint | null;
  mimeType: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  hasActiveShare?: boolean;
}

export function toNodeSummary(node: NodeRow, accessRole: AccessRole): NodeSummary {
  return Object.freeze({
    id: node.id,
    dataRoomId: node.dataRoomId,
    parentId: node.parentId,
    kind: node.kind,
    name: node.name,
    sizeBytes: node.sizeBytes === null ? null : node.sizeBytes.toString(),
    mimeType: node.mimeType as 'application/pdf' | null,
    revision: node.revision,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
    isShared: accessRole !== 'OWNER' || node.hasActiveShare === true,
    accessRole,
  });
}
