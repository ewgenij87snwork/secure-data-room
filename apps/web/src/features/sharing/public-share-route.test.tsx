import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PublicPdf } from './public-share-route.js';

const viewUrl = vi.hoisted(() => vi.fn());
vi.mock('./api.js', () => ({ readPublicFileViewUrl: viewUrl }));

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
      expiresAt: '2026-08-20T12:00:00.000Z',
    });
    render(
      <StrictMode>
        <PublicPdf nodeId="current" token="opaque" name="Current.pdf" />
      </StrictMode>,
    );
    expect(await screen.findByRole('link', { name: /open the document/i })).toHaveAttribute(
      'href',
      'https://cdn.test/current.pdf',
    );
  });

  it('does not let a late A response replace selected file B', async () => {
    const a = deferred<{ url: string; expiresAt: string }>();
    const b = deferred<{ url: string; expiresAt: string }>();
    viewUrl.mockImplementation((_, nodeId: string) => (nodeId === 'a' ? a.promise : b.promise));
    const view = render(<PublicPdf nodeId="a" token="opaque" name="A.pdf" />);
    view.rerender(<PublicPdf nodeId="b" token="opaque" name="B.pdf" />);
    a.resolve({ url: 'https://cdn.test/a.pdf', expiresAt: '2026-08-20T12:00:00.000Z' });
    await Promise.resolve();
    expect(screen.queryByRole('link', { name: /open the document/i })).not.toBeInTheDocument();
    b.resolve({ url: 'https://cdn.test/b.pdf', expiresAt: '2026-08-20T12:00:00.000Z' });
    expect(await screen.findByRole('link', { name: /open the document/i })).toHaveAttribute(
      'href',
      'https://cdn.test/b.pdf',
    );
  });
});
