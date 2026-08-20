import type { NodeSummary } from '@data-room/contracts';
import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context.js';
import { ApiClientError } from '../../lib/api-error.js';
import { Breadcrumbs } from './components/breadcrumbs.js';
import { CreateFolderDialog } from './components/create-folder-dialog.js';
import { DeleteNodeDialog } from './components/delete-node-dialog.js';
import { FolderAccessPanel } from './components/folder-access-panel.js';
import { FolderToolbar } from './components/folder-toolbar.js';
import { NodeBrowser } from './components/node-browser.js';
import { RenameNodeDialog } from './components/rename-node-dialog.js';
import { MoveFileDialog } from './components/move-file-dialog.js';
import { WorkspaceHeader } from './components/workspace-header.js';
import { WorkspaceShell } from './components/workspace-shell.js';
import { WorkspaceSidebar } from './components/workspace-sidebar.js';
import type { DataRoomOutletContext } from './data-room-context.js';
import { useNode, useNodeBreadcrumbs, useNodeChildren } from './data-room-queries.js';
import { UploadDropzone } from '../uploads/components/upload-dropzone.js';
import { useOptionalUploadQueue } from '../uploads/upload-queue-context.js';
import { shouldShowUploadDropzone } from './data-room-upload-visibility.js';

interface SelectedNode {
  node: NodeSummary;
  returnFocusElement: HTMLElement | null;
}

export function DataRoomRoute(): React.JSX.Element {
  const { nodeId } = useParams();
  const { bootstrap } = useOutletContext<DataRoomOutletContext>();
  const auth = useAuth();
  const queue = useOptionalUploadQueue();
  const addFiles = queue?.addFiles;
  const resolvedNodeId = nodeId ?? bootstrap.room.rootNodeId;
  const nodeQuery = useNode(resolvedNodeId);
  const breadcrumbsQuery = useNodeBreadcrumbs(resolvedNodeId);
  const isFolder = nodeQuery.data?.kind === 'FOLDER';
  const childrenQuery = useNodeChildren(resolvedNodeId, isFolder);
  const [createReturnFocus, setCreateReturnFocus] = useState<HTMLButtonElement | null>(null);
  const [renameTarget, setRenameTarget] = useState<SelectedNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SelectedNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<SelectedNode | null>(null);
  const accountLabel = bootstrap.user.displayName ?? bootstrap.user.email;
  const currentNode = nodeQuery.data;
  const canManage = currentNode?.accessRole === 'OWNER' && !bootstrap.runtime.maintenanceMode;
  const canUpload = shouldShowUploadDropzone({
    canManage,
    uploadsEnabled: bootstrap.runtime.uploadsEnabled,
    nodeKind: currentNode?.kind,
  });
  const children = childrenQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const shell = (content: React.ReactNode, context?: React.ReactNode): React.JSX.Element => (
    <WorkspaceShell
      sidebar={
        <WorkspaceSidebar roomName={bootstrap.room.name} rootNodeId={bootstrap.room.rootNodeId} />
      }
      header={<WorkspaceHeader accountLabel={accountLabel} onSignOut={() => void auth.signOut()} />}
      context={context}
    >
      {content}
    </WorkspaceShell>
  );

  if (nodeQuery.isLoading) {
    return shell(
      <section className="workspace-state" aria-labelledby="workspace-title">
        <p className="eyebrow">Document room</p>
        <h1 id="workspace-title">Opening secure folder…</h1>
        <p role="status">Loading its current access and contents.</p>
      </section>,
    );
  }

  if (nodeQuery.isError || !currentNode) {
    const state = nodeErrorState(nodeQuery.error);
    return shell(
      <section className="workspace-state" aria-labelledby="workspace-title">
        <p className="eyebrow">Document room</p>
        <h1 id="workspace-title">{state.title}</h1>
        <p role="alert">{state.message}</p>
        <Link className="secondary-button" to={`/workspace/${bootstrap.room.rootNodeId}`}>
          Return to all files
        </Link>
      </section>,
    );
  }

  const breadcrumbs = breadcrumbsQuery.data?.items ?? [
    { id: currentNode.id, name: currentNode.name },
  ];

  return shell(
    <>
      <div className="workspace-content">
        <Breadcrumbs items={breadcrumbs} />
        {currentNode.accessRole !== 'OWNER' ? (
          <div className="read-only-banner" role="status">
            Read-only access. Owner controls are not available in this view.
          </div>
        ) : null}
        <div className="workspace-heading">
          <div className="workspace-heading__copy">
            <p className="eyebrow">{currentNode.kind === 'FOLDER' ? 'Folder' : 'PDF document'}</p>
            <h1 id="workspace-title" title={currentNode.name}>
              {currentNode.name}
            </h1>
          </div>
          {isFolder ? (
            <FolderToolbar canManage={canManage} onCreateFolder={setCreateReturnFocus} />
          ) : null}
        </div>
        {breadcrumbsQuery.isError ? (
          <p className="inline-notice" role="status">
            The folder opened, but its breadcrumb path is temporarily unavailable.
          </p>
        ) : null}
        {isFolder ? (
          <NodeBrowser
            nodes={children}
            canManage={canManage}
            isLoading={childrenQuery.isLoading}
            isError={childrenQuery.isError}
            isRefreshing={childrenQuery.isFetching && !childrenQuery.isFetchingNextPage}
            hasNextPage={childrenQuery.hasNextPage}
            isLoadingMore={childrenQuery.isFetchingNextPage}
            onLoadMore={() => void childrenQuery.fetchNextPage()}
            onRename={(node, returnFocusElement) => setRenameTarget({ node, returnFocusElement })}
            onDelete={(node, returnFocusElement) => setDeleteTarget({ node, returnFocusElement })}
            onMove={(node, returnFocusElement) => setMoveTarget({ node, returnFocusElement })}
          />
        ) : (
          <section className="document-summary" aria-label="Document summary">
            <p>
              This PDF is available to your account. Document viewing is handled in the file route.
            </p>
          </section>
        )}
        {canUpload ? (
          <UploadDropzone
            disabled={!auth.accessToken || !addFiles}
            onFilesSelected={(files) => {
              if (addFiles) void addFiles(currentNode.id, files);
            }}
          />
        ) : null}
      </div>

      {isFolder && canManage && createReturnFocus ? (
        <CreateFolderDialog
          open
          onOpenChange={(open) => {
            if (!open) setCreateReturnFocus(null);
          }}
          parentId={currentNode.id}
          returnFocusElement={createReturnFocus}
        />
      ) : null}
      {renameTarget ? (
        <RenameNodeDialog
          key={`${renameTarget.node.id}:${renameTarget.node.revision}`}
          open
          onOpenChange={(open) => {
            if (!open) setRenameTarget(null);
          }}
          node={renameTarget.node}
          returnFocusElement={renameTarget.returnFocusElement}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteNodeDialog
          key={deleteTarget.node.id}
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          node={deleteTarget.node}
          returnFocusElement={deleteTarget.returnFocusElement}
        />
      ) : null}
      {moveTarget ? (
        <MoveFileDialog
          key={`${moveTarget.node.id}:${moveTarget.node.revision}`}
          open
          onOpenChange={(open) => {
            if (!open) setMoveTarget(null);
          }}
          node={moveTarget.node}
          currentFolderId={currentNode.id}
          returnFocusElement={moveTarget.returnFocusElement}
        />
      ) : null}
    </>,
    <FolderAccessPanel node={currentNode} />,
  );
}

function nodeErrorState(error: unknown): Readonly<{ title: string; message: string }> {
  if (error instanceof ApiClientError) {
    if (error.code === 'RESOURCE_GONE' || error.code === 'RESOURCE_NOT_FOUND') {
      return {
        title: 'This item is no longer available.',
        message: 'It may have been deleted or removed from your accessible workspace.',
      };
    }
    if (error.code === 'ACCESS_DENIED') {
      return {
        title: 'Access is no longer available.',
        message: 'Your permission for this item may have changed.',
      };
    }
  }
  return {
    title: 'This item could not be opened.',
    message: 'Please return to the room and try again.',
  };
}
