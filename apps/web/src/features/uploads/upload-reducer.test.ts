import { describe, expect, it } from 'vitest';
import { initialUploadQueueState, uploadReducer } from './upload-reducer.js';
import type { UploadItem } from './upload-types.js';

const file = new File(['%PDF-test'], 'report.pdf', { type: 'application/pdf' });
const base: UploadItem = {
  clientId: '11111111-1111-4111-8111-111111111111',
  parentId: '22222222-2222-4222-8222-222222222222',
  file,
  state: 'queued',
  bytesUploaded: 0,
  percent: 0,
  attempt: 0,
};

describe('uploadReducer', () => {
  it('preserves strict impossible-transition checks', () => {
    const state = uploadReducer(initialUploadQueueState, { type: 'add', items: [base] });
    expect(() =>
      uploadReducer(state, {
        type: 'succeeded',
        clientId: base.clientId,
        nodeId: 'node',
        finalName: 'report.pdf',
        conflictResolved: false,
      }),
    ).toThrow(/Invalid upload transition/);
  });

  it('clamps progress and isolates sibling items', () => {
    const sibling = { ...base, clientId: '33333333-3333-4333-8333-333333333333' };
    let state = uploadReducer(initialUploadQueueState, { type: 'add', items: [base, sibling] });
    state = uploadReducer(state, { type: 'preparing', clientId: base.clientId });
    state = uploadReducer(state, {
      type: 'uploading',
      clientId: base.clientId,
      sessionId: 'session',
    });
    state = uploadReducer(state, {
      type: 'progress',
      clientId: base.clientId,
      bytesUploaded: Number.MAX_SAFE_INTEGER,
    });
    expect(state.items[0]).toMatchObject({ bytesUploaded: file.size, percent: 100 });
    expect(state.items[1]).toEqual(sibling);
  });

  it('records retry, cancellation, and success fields', () => {
    let state = uploadReducer(initialUploadQueueState, { type: 'add', items: [base] });
    state = uploadReducer(state, { type: 'preparing', clientId: base.clientId });
    state = uploadReducer(state, {
      type: 'uploading',
      clientId: base.clientId,
      sessionId: 'session',
    });
    state = uploadReducer(state, { type: 'finalizing', clientId: base.clientId });
    state = uploadReducer(state, {
      type: 'succeeded',
      clientId: base.clientId,
      nodeId: 'node',
      finalName: 'report (1).pdf',
      conflictResolved: true,
    });
    expect(state.items[0]).toMatchObject({
      state: 'succeeded',
      finalNodeId: 'node',
      finalName: 'report (1).pdf',
      conflictResolved: true,
      percent: 100,
    });
    expect(() => uploadReducer(state, { type: 'cancelled', clientId: base.clientId })).toThrow(
      /Invalid upload transition/,
    );
  });
});
