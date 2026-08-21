import type { BootstrapResponse } from '@data-room/contracts';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/auth-context.js';
import { SharedWorkspaceLayout } from './shared-workspace-layout.js';

const bootstrap: BootstrapResponse = {
  user: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'reviewer@example.com',
    displayName: null,
  },
  room: {
    id: '650e8400-e29b-41d4-a716-446655440000',
    name: 'Review room',
    rootNodeId: '750e8400-e29b-41d4-a716-446655440000',
    createdAt: '2026-08-21T00:00:00.000Z',
  },
  runtime: {
    registrationOpen: true,
    uploadsEnabled: true,
    publicLinksEnabled: true,
    maintenanceMode: false,
    updatedAt: '2026-08-21T00:00:00.000Z',
  },
};

const auth: AuthContextValue = {
  status: 'authenticated',
  user: null,
  accessToken: 'access',
  isSigningIn: false,
  error: null,
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
};

describe('SharedWorkspaceLayout', () => {
  it('keeps shared materials inside the authenticated workspace shell', () => {
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/shared']}>
          <Routes>
            <Route element={<Outlet context={{ bootstrap }} />}>
              <Route element={<SharedWorkspaceLayout />}>
                <Route path="/shared" element={<h1 id="workspace-title">Shared with me</h1>} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByRole('navigation', { name: 'Workspace' })).toHaveTextContent(
      'Shared with me',
    );
    expect(screen.getByRole('banner')).toHaveTextContent('reviewer@example.com');
    expect(screen.getByRole('main')).toHaveAccessibleName('Shared with me');
  });
});
