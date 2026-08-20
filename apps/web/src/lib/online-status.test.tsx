import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlineStatus } from './online-status.js';

describe('OnlineStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
  });

  it('shows an offline status without calling it a server failure', () => {
    vi.stubGlobal('navigator', { onLine: false });
    render(<OnlineStatus />);

    expect(screen.getByRole('status')).toHaveTextContent('You are offline');
    expect(screen.getByRole('status')).not.toHaveTextContent(/server|failed/i);
  });

  it('announces reconnection and lets the user refresh', async () => {
    const refresh = vi.fn();
    render(<OnlineStatus onReconnect={refresh} />);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(await screen.findByRole('status')).toHaveTextContent('You are back online');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
