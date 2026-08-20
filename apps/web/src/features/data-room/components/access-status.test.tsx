import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccessStatus, type AccessState } from './access-status.js';

describe.each([
  { state: 'private' as const, label: 'Private' },
  { state: 'shared' as const, label: 'Shared' },
])('AccessStatus $state', ({ state, label }: { state: AccessState; label: string }) => {
  it('shows only the status icon while retaining non-focusable accessible text', () => {
    render(<AccessStatus state={state} />);
    const status = screen.getByTitle(label);

    expect(status).toHaveAttribute('data-access', state);
    expect(status).toHaveAccessibleName(label);
    expect(status).not.toHaveAttribute('tabindex');
    expect(within(status).getByText(label)).toHaveClass('sr-only');
    expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(status.querySelector('svg')).toHaveAttribute('width', '18');
  });
});
