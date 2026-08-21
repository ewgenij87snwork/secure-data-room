import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PublicPdf, PublicShareRoute } from './public-share-route.js';

const viewUrl = vi.hoisted(() => vi.fn());
const usePublicShare = vi.hoisted(() => vi.fn());
const usePublicChildren = vi.hoisted(() => vi.fn());
vi.mock('./api.js', () => ({ readPublicFileViewUrl: viewUrl }));
vi.mock('./queries.js', () => ({ usePublicShare, usePublicChildren }));
vi.mock('../../lib/public-token.js', () => ({
  capturePublicShareToken: () => 'share-token',
  clearPublicShareToken: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('PublicPdf request ordering', () => {
  it('renders the current signed URL under StrictMode effect replay', async () => {
    viewUrl.mockResolvedValue({
      url: 'https://cdn.test/current.pdf',
      downloadUrl: 'https://cdn.test/current-download.pdf',
      expiresAt: '2026-08-20T12:00:00.000Z',
    });
    render(
      <StrictMode>
        <PublicPdf nodeId="current" token="opaque" name="Current.pdf" />
      </StrictMode>,
    );
    expect(await screen.findByLabelText('PDF document: Current.pdf')).toHaveAttribute(
      'src',
      'https://cdn.test/current.pdf',
    );
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'href',
      'https://cdn.test/current-download.pdf',
    );
  });

  it('does not let a late A response replace selected file B', async () => {
    const a = deferred<{ url: string; downloadUrl: string; expiresAt: string }>();
    const b = deferred<{ url: string; downloadUrl: string; expiresAt: string }>();
    viewUrl.mockImplementation((_, nodeId: string) => (nodeId === 'a' ? a.promise : b.promise));
    const view = render(<PublicPdf nodeId="a" token="opaque" name="A.pdf" />);
    view.rerender(<PublicPdf nodeId="b" token="opaque" name="B.pdf" />);
    a.resolve({
      url: 'https://cdn.test/a.pdf',
      downloadUrl: 'https://cdn.test/a-download.pdf',
      expiresAt: '2026-08-20T12:00:00.000Z',
    });
    await Promise.resolve();
    expect(screen.queryByLabelText('PDF document: A.pdf')).not.toBeInTheDocument();
    b.resolve({
      url: 'https://cdn.test/b.pdf',
      downloadUrl: 'https://cdn.test/b-download.pdf',
      expiresAt: '2026-08-20T12:00:00.000Z',
    });
    expect(await screen.findByLabelText('PDF document: B.pdf')).toHaveAttribute(
      'src',
      'https://cdn.test/b.pdf',
    );
  });
});

describe('PublicShareRoute folder loading state', () => {
  it('does not present an unconfirmed public folder as empty', () => {
    usePublicShare.mockReturnValue({
      data: {
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'FOLDER',
        name: 'Shared folder',
      },
      isLoading: false,
      isError: false,
    });
    usePublicChildren.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <PublicShareRoute />
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading folder contents…')).toBeInTheDocument();
    expect(
      screen.queryByText('The owner has not added anything here yet.'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Yevgeniy Sorokin profiles')).toBeVisible();
  });
});
