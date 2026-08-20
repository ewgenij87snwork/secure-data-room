import { describe, expect, it } from 'vitest';
import { isSafeIntendedRoute } from './intended-route.js';

describe('auth route safety', () => {
  it.each(['/workspace', '/workspace?node=123', '/'])(
    'accepts same-origin application path %s',
    (value) => {
      expect(isSafeIntendedRoute(value)).toBe(true);
    },
  );

  it.each([
    'https://evil.example',
    '//evil.example/path',
    '/auth/callback',
    'not a url',
    '/\\evil',
  ])('rejects unsafe intended route %s', (value) => {
    expect(isSafeIntendedRoute(value)).toBe(false);
  });
});
