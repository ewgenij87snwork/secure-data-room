import type { NodeSummary } from '@data-room/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ResponsiveDialog } from '../components/ui/responsive-dialog.js';
import { FolderToolbar } from '../features/data-room/components/folder-toolbar.js';
import { NodeBrowser } from '../features/data-room/components/node-browser.js';
import { WorkspaceHeader } from '../features/data-room/components/workspace-header.js';
import { WorkspaceShell } from '../features/data-room/components/workspace-shell.js';
import { WorkspaceSidebar } from '../features/data-room/components/workspace-sidebar.js';
import { ReadOnlyBanner } from '../features/sharing/components/read-only-banner.js';
import { UploadDropzone } from '../features/uploads/components/upload-dropzone.js';
import { UploadProgress } from '../features/uploads/components/upload-progress.js';
import styles from '../styles.css?raw';

const node: NodeSummary = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  dataRoomId: '650e8400-e29b-41d4-a716-446655440000',
  parentId: null,
  kind: 'FILE',
  name: 'Board minutes.pdf',
  sizeBytes: '1024',
  mimeType: 'application/pdf',
  revision: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  isShared: false,
  accessRole: 'OWNER',
};

function renderWithProviders(ui: React.ReactNode): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {ui}
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('Quiet Authority accessibility', () => {
  it('has no serious or critical findings in authenticated workspace controls', async () => {
    const view = renderWithProviders(
      <WorkspaceShell
        sidebar={<WorkspaceSidebar roomName="Acquisition" rootNodeId={node.id} />}
        header={<WorkspaceHeader accountLabel="Owner" onSignOut={vi.fn()} />}
      >
        <h1 id="workspace-title">Acquisition</h1>
        <NodeBrowser
          nodes={[node]}
          canManage
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onMove={vi.fn()}
        />
        <UploadDropzone disabled={false} onFilesSelected={vi.fn()} />
      </WorkspaceShell>,
    );

    expect(
      (await axe(view.container)).violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      ),
    ).toEqual([]);
  });

  it('has no serious or critical findings in read-only public and upload states', async () => {
    const view = renderWithProviders(
      <main>
        <ReadOnlyBanner owner="Owner" />
        <h1>Public documents</h1>
        <NodeBrowser
          nodes={[{ ...node, accessRole: 'VIEWER', isShared: true }]}
          canManage={false}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />
        <UploadProgress
          item={{
            clientId: 'upload-1',
            parentId: node.id,
            file: new File(['pdf'], 'Board minutes.pdf', { type: 'application/pdf' }),
            state: 'uploading',
            percent: 42,
            bytesUploaded: 42,
            attempt: 1,
          }}
        />
      </main>,
    );

    expect(
      (await axe(view.container)).violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      ),
    ).toEqual([]);
  });

  it('keeps responsive dialogs keyboard reachable with predictable focus and focus return', async () => {
    const user = userEvent.setup();
    render(<DialogKeyboardHarness />);
    const trigger = screen.getByRole('button', { name: 'Open rename dialog' });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Rename document' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Rename document' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps owner mutation menus keyboard reachable and absent for viewers', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const viewer = renderWithProviders(
      <NodeBrowser nodes={[node]} canManage={false} onRename={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(
      viewer.queryByRole('button', { name: 'Actions for Board minutes.pdf' }),
    ).not.toBeInTheDocument();

    renderWithProviders(
      <NodeBrowser
        nodes={[node]}
        canManage
        onRename={onRename}
        onDelete={vi.fn()}
        onMove={vi.fn()}
      />,
    );
    const menuTrigger = screen.getAllByRole('button', {
      name: 'Actions for Board minutes.pdf',
    })[0]!;
    menuTrigger.focus();
    await user.keyboard('{Enter}');
    const renameItem = screen.getByRole('menuitem', { name: 'Rename' });
    expect(renameItem).toBeVisible();
    renameItem.focus();
    await user.keyboard('{Enter}');
    expect(onRename).toHaveBeenCalled();
  });

  it('reaches create and share actions through Tab and Enter', async () => {
    const user = userEvent.setup();
    const onCreateFolder = vi.fn();
    const onShare = vi.fn();
    render(<FolderToolbar canManage onCreateFolder={onCreateFolder} onShare={onShare} />);

    const createButton = screen.getByRole('button', { name: 'New folder' });
    const shareButton = screen.getByRole('button', { name: 'Share' });
    await user.tab();
    expect(createButton).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.tab();
    expect(shareButton).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onCreateFolder).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
    expect(onShare).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });

  it('defines deterministic reduced-motion source behavior for motion and progress feedback', () => {
    const reducedMotion =
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?(?=\n@media|\n\.[a-zA-Z]|$)/.exec(
        styles,
      )?.[0] ?? '';
    expect(reducedMotion).toContain('.spin');
    expect(reducedMotion).toContain('animation: none');
    expect(reducedMotion).toContain('transition: none');
  });
});

function DialogKeyboardHarness(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [returnFocusElement, setReturnFocusElement] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          setReturnFocusElement(event.currentTarget);
          setOpen(true);
        }}
      >
        Open rename dialog
      </button>
      {open ? (
        <ResponsiveDialog
          open
          onOpenChange={setOpen}
          title="Rename document"
          returnFocusElement={returnFocusElement}
        >
          <label htmlFor="rename-name">Name</label>
          <input id="rename-name" autoFocus defaultValue="Board minutes.pdf" />
        </ResponsiveDialog>
      ) : null}
    </>
  );
}
