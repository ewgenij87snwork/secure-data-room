import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { capturePublicShareToken, clearPublicShareToken } from './public-token';

const validToken = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const canonicalSuffixes = [
  'A',
  'E',
  'I',
  'M',
  'Q',
  'U',
  'Y',
  'c',
  'g',
  'k',
  'o',
  's',
  'w',
  '0',
  '4',
  '8',
];
const nonCanonicalSuffixes = ['B', 'F', 'Z', 'a', 'z', '1', '5', '9', '-', '_'];
const asLocation = (url: string): Location => new URL(url) as unknown as Location;

describe('public share token capture', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/share?view=compact');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('captures a valid 256-bit token and removes only the fragment', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const location = asLocation(`https://example.test/share?view=compact#token=${validToken}`);

    expect(capturePublicShareToken(location)).toBe(validToken);
    expect(sessionStorage.getItem('data-room:public-share-token')).toBe(validToken);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/share?view=compact');
  });

  it.each(canonicalSuffixes)('accepts a canonical 43-character token ending in %s', (suffix) => {
    const token = `${validToken.slice(0, -1)}${suffix}`;

    expect(capturePublicShareToken(asLocation(`https://example.test/share#token=${token}`))).toBe(
      token,
    );
    expect(sessionStorage.getItem('data-room:public-share-token')).toBe(token);
  });

  it.each(nonCanonicalSuffixes)(
    'rejects a noncanonical 43-character token ending in %s',
    (suffix) => {
      const token = `${validToken.slice(0, -1)}${suffix}`;

      expect(
        capturePublicShareToken(asLocation(`https://example.test/share#token=${token}`)),
      ).toBeNull();
      expect(sessionStorage.getItem('data-room:public-share-token')).toBeNull();
    },
  );

  it('returns the tab-scoped token when the fragment is absent', () => {
    sessionStorage.setItem('data-room:public-share-token', validToken);

    expect(capturePublicShareToken(asLocation('https://example.test/share?view=compact'))).toBe(
      validToken,
    );
  });

  it('rejects a malformed fragment token and clears stored state', () => {
    sessionStorage.setItem('data-room:public-share-token', validToken);
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const location = asLocation('https://example.test/share?view=compact#token=too-short');

    expect(capturePublicShareToken(location)).toBeNull();
    expect(sessionStorage.getItem('data-room:public-share-token')).toBeNull();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/share?view=compact');
  });

  it('rejects malformed stored state when no fragment is present', () => {
    sessionStorage.setItem('data-room:public-share-token', 'not-a-token');

    expect(
      capturePublicShareToken(asLocation('https://example.test/share?view=compact')),
    ).toBeNull();
    expect(sessionStorage.getItem('data-room:public-share-token')).toBeNull();
  });

  it('clears the public share token explicitly', () => {
    sessionStorage.setItem('data-room:public-share-token', validToken);

    clearPublicShareToken();

    expect(sessionStorage.getItem('data-room:public-share-token')).toBeNull();
  });
});
