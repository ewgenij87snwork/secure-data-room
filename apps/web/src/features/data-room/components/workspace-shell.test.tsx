import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceShell } from './workspace-shell.js';

describe('WorkspaceShell', () => {
  it('keeps navigation, primary content, and folder context in stable landmarks', () => {
    render(
      <WorkspaceShell
        sidebar={<span>Rooms</span>}
        header={<span>Private workspace</span>}
        context={<span>Folder access</span>}
      >
        <h1 id="workspace-title">Legal due diligence</h1>
      </WorkspaceShell>,
    );

    expect(screen.getByRole('navigation', { name: 'Workspace' })).toHaveTextContent('Rooms');
    expect(screen.getByRole('banner')).toHaveTextContent('Private workspace');
    expect(screen.getByRole('main')).toHaveAccessibleName('Legal due diligence');
    expect(screen.getByRole('complementary', { name: 'Folder context' })).toHaveTextContent(
      'Folder access',
    );
  });

  it('gives the main surface the full available width when no context panel exists', () => {
    render(
      <WorkspaceShell sidebar={<span>Rooms</span>} header={<span>Private workspace</span>}>
        <h1 id="workspace-title">Shared document</h1>
      </WorkspaceShell>,
    );

    expect(screen.getByRole('main').closest('.workspace-shell')).toHaveClass(
      'workspace-shell--without-context',
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
