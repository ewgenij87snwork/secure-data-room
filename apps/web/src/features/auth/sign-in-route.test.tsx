import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from './auth-context.js';
import { SignInRoute } from './sign-in-route.js';

const baseAuth: AuthContextValue = {
  status: 'anonymous',
  user: null,
  accessToken: null,
  signInWithGoogle: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  isSigningIn: false,
  error: null,
};

describe('SignInRoute', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders the Quiet Authority split with one primary Google action', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={baseAuth}>
          <SignInRoute />
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Confidential work, deliberately contained.' }),
    ).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    expect(screen.getByText(/permissions are enforced by the API/i)).toBeVisible();
  });

  it('stores only a safe intended route before starting OAuth', async () => {
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/sign-in', state: { from: '/workspace?node=42' } }]}
      >
        <AuthContext.Provider value={{ ...baseAuth, signInWithGoogle }}>
          <SignInRoute />
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(sessionStorage.getItem('intended-route')).toBe('/workspace?node=42');
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('announces OAuth failure and disables duplicate submission while pending', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider
          value={{ ...baseAuth, isSigningIn: true, error: 'Google sign-in could not be started.' }}
        >
          <SignInRoute />
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Connecting securely…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Google sign-in could not be started.');
  });
});
