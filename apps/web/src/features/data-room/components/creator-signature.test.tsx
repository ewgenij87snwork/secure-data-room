import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CreatorSignature } from './creator-signature.js';

describe('CreatorSignature', () => {
  it('exposes the creator identity and accessible profile links', () => {
    render(<CreatorSignature />);

    expect(screen.getByText('Yevgeniy Sorokin')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /GitHub profile for Yevgeniy Sorokin/i }),
    ).toHaveAttribute('href', 'https://github.com/ewgenij87snwork');
    expect(
      screen.getByRole('link', { name: /LinkedIn profile for Yevgeniy Sorokin/i }),
    ).toHaveAttribute('href', 'https://www.linkedin.com/in/yevgeniy-sorokin-829b7b18a/');
  });
});
