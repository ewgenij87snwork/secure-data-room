import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getChapter } from '../src/storyboard.ts';

type SceneOutputCommand = 'still' | 'draft:scene';
type WorkflowCommand = SceneOutputCommand | 'review' | 'deliver';

const VIDEO_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRY_POINT = 'src/index.ts';
const REMOTION_BIN = join(VIDEO_DIR, 'node_modules', '.bin', 'remotion');
const DRAFT_DIR = join(VIDEO_DIR, 'out', 'drafts');
const OUTPUT_DIR = join(VIDEO_DIR, 'out');

export function resolveScene(id: string) {
  return getChapter(id);
}

export function resolveOutput(command: SceneOutputCommand, sceneId: string): string {
  resolveScene(sceneId);

  if (command === 'still') {
    return join(DRAFT_DIR, `${sceneId}-still.png`);
  }

  return join(DRAFT_DIR, `${sceneId}-draft.mp4`);
}

function runRemotion(args: readonly string[]): void {
  const result = spawnSync(REMOTION_BIN, args, {
    cwd: VIDEO_DIR,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Remotion exited with status ${result.status ?? 'unknown'}.`);
  }
}

function renderStill(sceneId: string): void {
  const scene = resolveScene(sceneId);
  const output = resolveOutput('still', sceneId);

  runRemotion([
    'still',
    ENTRY_POINT,
    scene.compositionId,
    output,
    `--frame=${Math.floor(scene.duration / 2)}`,
    '--log=error',
  ]);
}

function renderSceneDraft(sceneId: string): void {
  const scene = resolveScene(sceneId);
  const output = resolveOutput('draft:scene', sceneId);

  runRemotion([
    'render',
    ENTRY_POINT,
    scene.compositionId,
    output,
    '--codec=h264',
    '--scale=0.5',
    '--crf=24',
    '--x264-preset=superfast',
    '--log=error',
  ]);
}

function renderReview(): void {
  runRemotion([
    'render',
    ENTRY_POINT,
    'SdrHero',
    join(DRAFT_DIR, 'full-review.mp4'),
    '--codec=h264',
    '--scale=0.5',
    '--crf=24',
    '--x264-preset=superfast',
    '--log=error',
  ]);
}

function renderDeliverables(): void {
  runRemotion([
    'render',
    ENTRY_POINT,
    'SdrHero',
    join(OUTPUT_DIR, 'secure-data-room-demo-master.mp4'),
    '--codec=h264',
    '--crf=14',
  ]);
  runRemotion([
    'render',
    ENTRY_POINT,
    'SdrHero',
    join(OUTPUT_DIR, 'secure-data-room-demo.gif'),
    '--codec=gif',
    '--every-nth-frame=3',
  ]);
}

function usage(): string {
  return [
    'Usage:',
    '  npm run still -- <scene>',
    '  npm run draft:scene -- <scene>',
    '  npm run review',
    '  npm run deliver',
    '',
    'Scenes: login, create-folder, upload, share, recipient, document',
  ].join('\n');
}

export function main(args: readonly string[]): void {
  const [command, sceneId, ...extra] = args;

  if (!command || extra.length > 0) {
    throw new Error(usage());
  }

  mkdirSync(DRAFT_DIR, { recursive: true });

  if (command === 'still' || command === 'draft:scene') {
    if (!sceneId) {
      throw new Error(usage());
    }

    if (command === 'still') renderStill(sceneId);
    else renderSceneDraft(sceneId);
    return;
  }

  if (sceneId) {
    throw new Error(usage());
  }

  if (command === 'review') {
    renderReview();
    return;
  }

  if (command === 'deliver') {
    renderDeliverables();
    return;
  }

  throw new Error(`Unknown command "${command}".\n${usage()}`);
}

const invokedPath = process.argv[1];

if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    main(process.argv.slice(2) as readonly WorkflowCommand[]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
