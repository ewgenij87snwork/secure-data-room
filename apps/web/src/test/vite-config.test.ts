import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';

const webRoot = process.cwd();
const originalBuildSha = process.env.VITE_BUILD_SHA;
const originalVercelCommitSha = process.env.VERCEL_GIT_COMMIT_SHA;

afterEach(() => {
  if (originalBuildSha === undefined) delete process.env.VITE_BUILD_SHA;
  else process.env.VITE_BUILD_SHA = originalBuildSha;

  if (originalVercelCommitSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = originalVercelCommitSha;
});

describe('web build metadata', () => {
  it('embeds the Vercel deployment commit instead of a stale manual build SHA', async () => {
    const staleSha = '01231b3fb9c2f65c94a87e3b4f6b116fef21c573';
    const deployedSha = '15f0bcb12f0aed04b172673036b2c479c11c9253';
    process.env.VITE_BUILD_SHA = staleSha;
    process.env.VERCEL_GIT_COMMIT_SHA = deployedSha;

    const result = await build({
      root: webRoot,
      configFile: path.join(webRoot, 'vite.config.ts'),
      logLevel: 'silent',
      build: { write: false },
    });
    if (!Array.isArray(result) && !('output' in result)) {
      throw new Error('Expected a completed Vite build.');
    }

    const outputs = Array.isArray(result) ? result : [result];
    const html = outputs
      .flatMap((output) => output.output)
      .find((output) => output.type === 'asset' && output.fileName === 'index.html');

    if (html?.type !== 'asset') throw new Error('Built index.html is missing.');
    const htmlSource =
      typeof html.source === 'string' ? html.source : new TextDecoder().decode(html.source);

    expect(htmlSource).toContain(deployedSha);
    expect(htmlSource).not.toContain(staleSha);
  });
});
