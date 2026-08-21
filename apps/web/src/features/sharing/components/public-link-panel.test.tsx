import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicLinkPanel } from './public-link-panel.js';

describe('PublicLinkPanel', () => {
  it('keeps a newly created link readable and exposes an explicit copy action', () => {
    render(
      <PublicLinkPanel
        url="https://secure-data-room.example/share#token=visible-once"
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Public link' })).toHaveValue(
      'https://secure-data-room.example/share#token=visible-once',
    );
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled();
  });
});
