import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOutput, resolveScene } from './video-workflow.ts';

test('resolves a friendly scene name to its Remotion composition', () => {
  assert.equal(resolveScene('share').compositionId, 'SdrSceneShare');
});

test('keeps still and scene draft outputs away from final assets', () => {
  assert.match(resolveOutput('still', 'share'), /out\/drafts\/share-still\.png$/);
  assert.match(resolveOutput('draft:scene', 'upload'), /out\/drafts\/upload-draft\.mp4$/);
});

test('rejects unknown scene names with the accepted list', () => {
  assert.throws(
    () => resolveScene('missing'),
    /Choose: login, create-folder, upload, share, recipient, document\./,
  );
});
