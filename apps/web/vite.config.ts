import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

type BuildCommitEnvironment = Partial<
  Record<'GIT_COMMIT_SHA' | 'VERCEL_GIT_COMMIT_SHA' | 'VITE_BUILD_SHA', string | undefined>
>;

export function resolveWebBuildSha(env: BuildCommitEnvironment): string {
  return env.VERCEL_GIT_COMMIT_SHA ?? env.GIT_COMMIT_SHA ?? env.VITE_BUILD_SHA ?? 'local';
}

function buildMetadataPlugin(buildSha: string): Plugin {
  return {
    name: 'data-room-build-metadata',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replaceAll('%VITE_BUILD_SHA%', buildSha);
      },
    },
  };
}

export default defineConfig(() => {
  const buildSha = resolveWebBuildSha(process.env);

  return {
    define: {
      'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha),
    },
    plugins: [buildMetadataPlugin(buildSha), react(), tailwindcss()],
    build: { sourcemap: true },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
    },
  };
});
