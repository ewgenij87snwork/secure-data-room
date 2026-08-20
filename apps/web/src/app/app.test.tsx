import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './app.js';

describe('App foundation', () => {
  it('renders the frozen architecture boundary', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Foundation contract is ready.' })).toBeVisible();
    expect(screen.getByText('NestJS is the only application backend.')).toBeVisible();
  });
});
