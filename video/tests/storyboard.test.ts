import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAPTERS, FULL_DURATION, getChapter } from '../src/storyboard.ts';

test('chapters cover the complete timeline without gaps', () => {
  assert.deepEqual(
    CHAPTERS.map(({ id }) => id),
    ['login', 'create-folder', 'upload', 'share', 'recipient', 'document'],
  );
  assert.equal(CHAPTERS[0]?.from, 0);

  for (let index = 1; index < CHAPTERS.length; index += 1) {
    const previous = CHAPTERS[index - 1];
    const current = CHAPTERS[index];

    assert.equal(current?.from, previous!.from + previous!.duration);
  }

  const last = CHAPTERS.at(-1)!;
  assert.equal(last.from + last.duration, FULL_DURATION);
});

test('unknown chapter names fail clearly', () => {
  assert.throws(
    () => getChapter('missing'),
    /Unknown scene "missing"\. Choose: login, create-folder, upload, share, recipient, document\./,
  );
});
