import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataRoomState } from './data-room-state.js';

describe('DataRoomState', () => {
  it('announces initial loading without presenting stale content', () => {
    render(<DataRoomState kind="loading" label="Loading folder contents" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading folder contents');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a true empty state with an actionable heading', () => {
    render(
      <DataRoomState
        kind="empty"
        eyebrow="Nothing here yet"
        title="Your data room is ready"
        message="Create a folder or upload PDF documents to start organizing due-diligence materials."
      />,
    );

    expect(screen.getByRole('heading', { name: 'Your data room is ready' })).toBeVisible();
    expect(screen.getByText(/Create a folder or upload PDF/)).toBeVisible();
  });

  it('offers retry for a recoverable error', async () => {
    const retry = vi.fn();
    render(
      <DataRoomState
        kind="error"
        title="Folder contents are unavailable"
        message="The connection could not be completed. Your data is unchanged."
        onRetry={retry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Your data is unchanged');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
