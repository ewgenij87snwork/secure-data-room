import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResponsiveDialog } from './responsive-dialog.js';

describe('ResponsiveDialog', () => {
  it('has a stable accessible name and emits close intent on Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ResponsiveDialog
        open
        onOpenChange={onOpenChange}
        title="Delete Legal"
        description="Review the exact impact before deletion."
      >
        <button type="button">Delete permanently</button>
      </ResponsiveDialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Delete Legal' })).toHaveAccessibleDescription(
      'Review the exact impact before deletion.',
    );
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
