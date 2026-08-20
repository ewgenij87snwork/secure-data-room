import type { NodeSummary } from '@data-room/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FolderAccessPanel } from './folder-access-panel.js';

describe.each([
  ['OWNER', 'Owner'],
  ['EDITOR', 'Editor'],
  ['VIEWER', 'Viewer'],
] as const)('FolderAccessPanel %s', (accessRole, label) => {
  it('states the effective contract role precisely', () => {
    render(<FolderAccessPanel node={folder(accessRole)} />);
    expect(screen.getByText(label)).toBeVisible();
  });
});

function folder(accessRole: NodeSummary['accessRole']): NodeSummary {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    dataRoomId: '650e8400-e29b-41d4-a716-446655440000',
    parentId: null,
    kind: 'FOLDER',
    name: 'Legal',
    sizeBytes: null,
    mimeType: null,
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    isShared: false,
    accessRole,
  };
}
