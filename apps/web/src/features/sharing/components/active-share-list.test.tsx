import type { ShareSummary } from '@data-room/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActiveShareList } from './active-share-list.js';

const share: ShareSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  targetNodeId: '22222222-2222-4222-8222-222222222222',
  targetName: 'Room',
  principalType: 'USER',
  role: 'VIEWER',
  recipientEmail: 'person@example.com',
  createdAt: '2026-08-20T00:00:00.000Z',
  revokedAt: null,
};
const base = { shares: [share], onRevoke: vi.fn() };

describe('ActiveShareList states', () => {
  it('reports loading instead of empty', () => {
    render(<ActiveShareList {...base} isLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });
  it('reports load failure with retry', () => {
    const retry = vi.fn();
    render(<ActiveShareList {...base} shares={[]} error onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
  });
  it('shows the pending revoke target', () => {
    render(<ActiveShareList {...base} isRevoking revokingShareId={share.id} />);
    expect(screen.getByRole('button', { name: 'Revoking…' })).toBeDisabled();
    expect(screen.getByText('person@example.com')).toBeInTheDocument();
  });
  it('preserves the row and offers retry after revoke failure', () => {
    const retry = vi.fn();
    render(
      <ActiveShareList {...base} revokeError revokingShareId={share.id} onRetryRevoke={retry} />,
    );
    expect(screen.getByText('person@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
  });
});
