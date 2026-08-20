import type { NodeSummary } from '@data-room/contracts';
import type { AccessState } from './access-status.js';

export interface NodeItemViewModel {
  node: NodeSummary;
  id: string;
  kind: NodeSummary['kind'];
  name: string;
  modifiedLabel: string;
  sizeLabel: string;
  accessState: AccessState;
  canManage: boolean;
}

const dateFormatter = new Intl.DateTimeFormat('en', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function toNodeViewModel(node: NodeSummary, canManage: boolean): NodeItemViewModel {
  return {
    node,
    id: node.id,
    kind: node.kind,
    name: node.name,
    modifiedLabel: dateFormatter.format(new Date(node.updatedAt)),
    sizeLabel: node.kind === 'FOLDER' ? '—' : formatBytes(node.sizeBytes ?? '0'),
    accessState: node.isShared ? 'shared' : 'private',
    canManage: canManage && node.accessRole === 'OWNER',
  };
}

export function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = size >= 10 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}
