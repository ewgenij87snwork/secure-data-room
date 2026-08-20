import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1/');
vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key-1234567890');

describe('RuntimeApp', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('wires the real provider and router boundary into the secure sign-in surface', async () => {
    const { RuntimeApp } = await import('./runtime.js');
    render(<RuntimeApp />);

    expect(
      await screen.findByRole('heading', {
        name: 'Confidential work, deliberately contained.',
      }),
    ).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Continue with Google' })).toHaveLength(1);
  });
});
