import type { NodeSummary } from '@data-room/contracts';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { NodeBrowser } from './node-browser.js';

const folder = node({
  id: '550e8400-e29b-41d4-a716-446655440001',
  kind: 'FOLDER',
  name: 'Contracts with an intentionally long but fully accessible folder name',
  isShared: false,
});
const file = node({
  id: '550e8400-e29b-41d4-a716-446655440002',
  kind: 'FILE',
  name: 'Board minutes.pdf',
  sizeBytes: '1048576',
  mimeType: 'application/pdf',
  isShared: true,
});

describe('NodeBrowser', () => {
  it('uses one ordered model for the desktop ledger and mobile cards', () => {
    render(
      <MemoryRouter>
        <NodeBrowser
          nodes={[folder, file]}
          canManage={false}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />
      </MemoryRouter>,
    );

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent(folder.name);
    expect(rows[1]).toHaveTextContent(file.name);
    expect(screen.getAllByTitle('Private')).toHaveLength(2);
    expect(screen.getAllByTitle('Shared')).toHaveLength(2);
    expect(screen.getAllByTitle(folder.name)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
  });

  it('shows owner actions per node instead of inheriting the parent role', () => {
    const ownedFile = node({
      id: '550e8400-e29b-41d4-a716-446655440003',
      kind: 'FILE',
      name: 'Owned.pdf',
      sizeBytes: '512',
      mimeType: 'application/pdf',
      accessRole: 'OWNER',
    });
    render(
      <MemoryRouter>
        <NodeBrowser nodes={[folder, ownedFile]} canManage onRename={vi.fn()} onDelete={vi.fn()} />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('button', { name: `Actions for ${folder.name}` }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Actions for Owned.pdf' })).toHaveLength(2);
  });
});

function node(overrides: Partial<NodeSummary>): NodeSummary {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    dataRoomId: '650e8400-e29b-41d4-a716-446655440000',
    parentId: '750e8400-e29b-41d4-a716-446655440000',
    kind: 'FOLDER',
    name: 'Legal',
    sizeBytes: null,
    mimeType: null,
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isShared: false,
    accessRole: 'VIEWER',
    ...overrides,
  };
}
