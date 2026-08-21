import { describe, expect, it } from 'vitest';
import { resolveBuildCommitSha } from './env.js';

describe('resolveBuildCommitSha', () => {
  it('prefers Vercel deployment identity over a manually configured fallback', () => {
    expect(
      resolveBuildCommitSha({
        GIT_COMMIT_SHA: 'manually-configured-sha',
        VERCEL_GIT_COMMIT_SHA: 'deployed-sha',
      }),
    ).toBe('deployed-sha');
  });

  it('falls back safely outside Vercel', () => {
    expect(resolveBuildCommitSha({ GIT_COMMIT_SHA: 'local-sha' })).toBe('local-sha');
    expect(resolveBuildCommitSha({})).toBe('local');
  });
});
