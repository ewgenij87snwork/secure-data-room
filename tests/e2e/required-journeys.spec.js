import { Buffer } from 'node:buffer';
import { URL, URLSearchParams } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  actorContext,
  assertActorIdentity,
  cleanupRunNodes,
  createFolder,
  escapeRegExp,
  minimalPdf,
  openNode,
  requiredEnv,
  uniqueRunName,
  uploadPdf,
  waitForNodeRead,
} from './fixtures.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function nodeAction(page, nodeName) {
  return page.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(nodeName)} actions$`, 'i'),
  });
}

function responseId(body, ...keys) {
  for (const key of keys) {
    if (typeof body?.[key] === 'string') {
      expect(body[key]).toMatch(uuidPattern);
      return body[key];
    }
  }
  throw new Error(`Response is missing required identifier: ${keys.join(' or ')}`);
}

function publicShareToken(rawUrl) {
  const fragment = new URL(rawUrl).hash.slice(1);
  const token = new URLSearchParams(fragment).get('token') ?? fragment;
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  return token;
}

function uploadApiKind(request) {
  const pathname = new URL(request.url()).pathname;
  if (request.method() === 'POST' && /\/uploads\/prepare\/?$/u.test(pathname)) return 'prepare';
  if (request.method() === 'POST' && /\/uploads\/[^/]+\/finalize\/?$/u.test(pathname))
    return 'finalize';
  if (request.method() === 'DELETE' && /\/uploads\/[^/]+\/?$/u.test(pathname)) return 'cancel';
  return null;
}

function uploadApiFact(request, kind) {
  const bodyText = request.postData() ?? '';
  let bodyKeys = [];
  let fileKeys = [];
  try {
    const body = JSON.parse(bodyText);
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      bodyKeys = Object.keys(body).sort();
      const firstFile = Array.isArray(body.files) ? body.files[0] : null;
      if (firstFile && typeof firstFile === 'object' && !Array.isArray(firstFile))
        fileKeys = Object.keys(firstFile).sort();
    }
  } catch {
    // Empty DELETE bodies and malformed payloads remain observable through the safe facts below.
  }
  const headers = request.headers();
  return {
    kind,
    method: request.method(),
    bodyLength: Buffer.byteLength(bodyText),
    bodyKeys,
    fileKeys,
    hasPdfBytes: bodyText.includes('%PDF-') || bodyText.includes('JVBERi0'),
    hasCapabilityField: /"(?:uploadToken|token|signature|capability)"/iu.test(bodyText),
    hasSignatureHeader: Boolean(headers['x-signature']),
  };
}

function preparedUploadEvidence(body) {
  expect(Array.isArray(body?.uploads)).toBe(true);
  expect(body?.uploads?.length).toBe(1);
  const prepared = body.uploads[0];
  expect(prepared?.clientId).toMatch(uuidPattern);
  expect(prepared?.sessionId).toMatch(uuidPattern);
  expect(typeof prepared?.storageKey).toBe('string');
  expect(prepared.storageKey.length).toBeGreaterThan(0);
  return {
    clientId: prepared.clientId,
    sessionId: prepared.sessionId,
    storageKey: prepared.storageKey,
  };
}

async function shareWithViewer(page) {
  const viewerEmail = requiredEnv('E2E_VIEWER_EMAIL');
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/shares') &&
      !response.url().includes('/public'),
  );
  await page.getByRole('button', { name: /^share$/i }).click();
  const dialog = page.getByRole('dialog', { name: /^share /i });
  await dialog.getByRole('textbox', { name: /email address/i }).fill(viewerEmail);
  await dialog.getByRole('button', { name: /grant access|share/i }).click();
  const response = await created;
  expect(response.ok()).toBe(true);
  const shareId = responseId(await response.json(), 'id', 'shareId');
  await expect(dialog).toBeHidden();
  return { id: shareId, recipient: viewerEmail };
}

async function createPublicShare(page) {
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/shares') &&
      response.url().includes('/public'),
  );
  await page.getByRole('button', { name: /^share$/i }).click();
  const dialog = page.getByRole('dialog', { name: /^share /i });
  await dialog.getByRole('button', { name: /create public link/i }).click();
  const response = await created;
  expect(response.ok()).toBe(true);
  const body = await response.json();
  const shareId = responseId(body, 'shareId', 'id');
  expect(typeof body.url).toBe('string');
  await expect(dialog).toBeHidden();
  return { id: shareId, url: body.url };
}

async function revokeShare(page, share, accessibleName) {
  const revoked = page.waitForResponse(
    (response) =>
      ['DELETE', 'PATCH'].includes(response.request().method()) &&
      response.url().includes(`/shares/${share.id}`),
  );
  await page.getByRole('button', { name: /^share$/i }).click();
  const dialog = page.getByRole('dialog', { name: /^share /i });
  const shareRow = dialog
    .getByRole('listitem')
    .filter({ hasText: new RegExp(escapeRegExp(accessibleName), 'i') });
  await shareRow.getByRole('button', { name: /^revoke$/i }).click();
  expect((await revoked).ok()).toBe(true);
  await expect(dialog).toBeHidden();
}

async function deleteListedNode(page, node) {
  const impactResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' && response.url().includes(`/nodes/${node.id}/impact`),
  );
  await nodeAction(page, node.name).click();
  await page.getByRole('menuitem', { name: /delete/i }).click();
  const impact = await impactResponse;
  expect(impact.ok()).toBe(true);

  const deletion = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' && response.url().includes(`/nodes/${node.id}`),
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /delete|confirm/i })
    .click();
  expect((await deletion).ok()).toBe(true);
  return impact.json();
}

async function expectNodeReadDenied(page, nodeId, expectedStates = [403, 404]) {
  const denied = waitForNodeRead(page, nodeId);
  await page.goto(`/workspace/${nodeId}`);
  expect(expectedStates).toContain((await denied).status());
  await expect(
    page.getByText(/forbidden|not authorized|not found|no longer available/i),
  ).toBeVisible();
}

async function cleanupOwnerRun(browser) {
  const context = await actorContext(browser, 'owner');
  try {
    await cleanupRunNodes(await context.newPage());
  } finally {
    await context.close();
  }
}

test.describe('P6-T3 required journeys', () => {
  test.beforeAll(async ({ browser }) => {
    for (const actor of ['owner', 'viewer', 'unrelated']) {
      await assertActorIdentity(browser, actor);
    }
    await cleanupOwnerRun(browser);
  });
  test.afterAll(async ({ browser }) => cleanupOwnerRun(browser));

  test('Owner A: nested folders persist breadcrumbs and can be renamed', async ({ browser }) => {
    const context = await actorContext(browser, 'owner');
    try {
      const page = await context.newPage();
      const run = uniqueRunName('breadcrumbs');
      await page.goto('/');
      const parent = await createFolder(page, run);
      const nested = await createFolder(page, `${run}-nested`);
      const breadcrumbs = page.getByRole('navigation', { name: /breadcrumb/i });
      await expect(breadcrumbs).toContainText(parent.name);
      await expect(breadcrumbs).toContainText(nested.name);

      await page.reload();
      await expect(breadcrumbs).toContainText(parent.name);
      await expect(breadcrumbs).toContainText(nested.name);
      await breadcrumbs.getByRole('link', { name: parent.name, exact: true }).click();

      const renamed = `${run}-renamed`;
      const renameResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes(`/nodes/${nested.id}/name`),
      );
      await nodeAction(page, nested.name).click();
      await page.getByRole('menuitem', { name: /rename/i }).click();
      const dialog = page.getByRole('dialog', { name: /rename/i });
      await dialog.getByRole('textbox', { name: /folder name/i }).fill(renamed);
      await dialog.getByRole('button', { name: /save|rename/i }).click();
      expect((await renameResponse).ok()).toBe(true);
      await expect(page.getByRole('link', { name: renamed, exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('Owner A: one batch exposes independent progress and isolates an invalid file', async ({
    browser,
  }) => {
    const context = await actorContext(browser, 'owner');
    try {
      const page = await context.newPage();
      const run = uniqueRunName('uploads');
      await page.goto('/');
      await createFolder(page, run);
      const duplicateName = `${run}-same-name.pdf`;
      const uniqueName = `${run}-unique.pdf`;
      const validNames = [duplicateName, duplicateName, uniqueName];
      const invalidName = `${run}-invalid.txt`;
      const finalizations = [];
      const uploadGates = [];
      const captureFinalization = (response) => {
        if (
          response.request().method() === 'POST' &&
          /\/v1\/uploads\/[^/]+\/finalize(?:\?|$)/u.test(response.url())
        ) {
          finalizations.push(response);
        }
      };
      const gateTusUpload = async (route) => {
        const request = route.request();
        if (
          request.method() === 'PATCH' &&
          request.headers()['tus-resumable'] &&
          uploadGates.length < validNames.length
        ) {
          await new Promise((release) => {
            uploadGates.push({ release, url: request.url() });
          });
        }
        await route.continue();
      };
      let uploadRouteInstalled = true;
      const releaseUploads = async () => {
        for (const gate of uploadGates) gate.release();
        if (uploadRouteInstalled) {
          await page.unroute('**/*', gateTusUpload);
          uploadRouteInstalled = false;
        }
      };

      page.on('response', captureFinalization);
      await page.route('**/*', gateTusUpload);

      try {
        await page.locator('input[type="file"]').setInputFiles([
          ...validNames.map((name) => ({
            name,
            mimeType: 'application/pdf',
            buffer: minimalPdf,
          })),
          { name: invalidName, mimeType: 'text/plain', buffer: Buffer.from('not a PDF') },
        ]);

        await expect.poll(() => uploadGates.length).toBe(validNames.length);
        expect(new Set(uploadGates.map(({ url }) => url)).size).toBe(validNames.length);

        const progressBars = page.getByRole('progressbar');
        await expect(progressBars).toHaveCount(validNames.length);
        for (let index = 0; index < validNames.length; index += 1) {
          const progress = progressBars.nth(index);
          await expect(progress).toBeVisible();
          await expect(progress).toHaveAccessibleName(validNames[index]);
          const value = Number(await progress.getAttribute('aria-valuenow'));
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(100);
        }

        await releaseUploads();
        for (let index = 0; index < validNames.length; index += 1) {
          await expect(progressBars.nth(index)).toHaveAttribute('aria-valuenow', '100');
        }
        await expect(
          page.getByRole('listitem').filter({ hasText: /completed|uploaded/i }),
        ).toHaveCount(validNames.length);
        const invalidItem = page.getByRole('listitem', {
          name: new RegExp(escapeRegExp(invalidName), 'i'),
        });
        await expect(invalidItem.getByRole('alert')).toContainText(/invalid|unsupported|PDF/i);
        await expect(invalidItem).not.toContainText(/completed|uploaded/i);

        expect(finalizations).toHaveLength(3);
        const finalizedBodies = await Promise.all(
          finalizations.map(async (response) => {
            expect(response.ok()).toBe(true);
            return response.json();
          }),
        );
        const finalizedIds = finalizedBodies.map((body) => responseId(body, 'nodeId'));
        const finalNames = finalizedBodies.map(({ finalName }) => finalName);
        expect(new Set(finalizedIds).size).toBe(validNames.length);
        expect(new Set(finalNames).size).toBe(validNames.length);
        expect(finalNames.filter((name) => name === duplicateName)).toHaveLength(1);
        expect(finalNames).toContain(uniqueName);
        expect(finalNames.some((name) => name === invalidName)).toBe(false);
        expect(finalizedBodies.filter(({ conflictResolved }) => conflictResolved)).toHaveLength(1);
      } finally {
        await releaseUploads();
        page.off('response', captureFinalization);
      }
    } finally {
      await context.close();
    }
  });

  test('Owner A: direct TUS retry and in-flight cancel preserve API boundaries', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const context = await actorContext(browser, 'owner');
    try {
      const page = await context.newPage();
      const run = uniqueRunName('upload-hardening');
      const retryName = `${run}-retry.pdf`;
      const cancelName = `${run}-cancel.pdf`;
      const apiFacts = [];
      const tusFacts = [];
      let apiOrigin = null;
      let initialSessionId = null;
      let cancelSessionId = null;
      let initialCancelRequests = 0;
      let cancelRequests = 0;
      let cancelFinalizations = 0;
      let transportMode = 'fail';
      let heldTus = false;
      let resolveHeldTusSeen;
      let releaseHeldTus;
      const heldTusSeen = new Promise((resolve) => {
        resolveHeldTusSeen = resolve;
      });
      const heldTusGate = new Promise((resolve) => {
        releaseHeldTus = resolve;
      });

      const captureApiBoundary = (request) => {
        const kind = uploadApiKind(request);
        if (!kind) return;
        apiOrigin ??= new URL(request.url()).origin;
        apiFacts.push(uploadApiFact(request, kind));
        const pathname = new URL(request.url()).pathname;
        if (kind === 'cancel' && initialSessionId && pathname.endsWith(`/${initialSessionId}`))
          initialCancelRequests += 1;
        if (kind === 'cancel' && cancelSessionId && pathname.endsWith(`/${cancelSessionId}`))
          cancelRequests += 1;
        if (
          kind === 'finalize' &&
          cancelSessionId &&
          pathname.endsWith(`/${cancelSessionId}/finalize`)
        )
          cancelFinalizations += 1;
      };
      const controlTusTransport = async (route) => {
        const request = route.request();
        const headers = request.headers();
        const isTusWrite =
          Boolean(headers['tus-resumable']) && ['POST', 'PATCH'].includes(request.method());
        if (!isTusWrite) {
          await route.continue();
          return;
        }

        tusFacts.push({
          method: request.method(),
          hasSignature: Boolean(headers['x-signature']),
          hasAuthorization: Boolean(headers.authorization),
          usesDifferentOrigin: apiOrigin ? new URL(request.url()).origin !== apiOrigin : false,
        });
        if (transportMode === 'fail' || transportMode === 'abort-cancel') {
          await route.abort('failed');
          return;
        }
        if (transportMode === 'hold-cancel' && !heldTus) {
          heldTus = true;
          resolveHeldTusSeen();
          await heldTusGate;
          await route.abort('failed').catch(() => undefined);
          return;
        }
        await route.continue();
      };

      page.on('request', captureApiBoundary);
      await page.route('**/*', controlTusTransport);
      try {
        await page.goto('/');
        await createFolder(page, run);

        const firstPrepare = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            /\/v1\/uploads\/prepare(?:\?|$)/u.test(response.url()),
        );
        await page.locator('input[type="file"]').setInputFiles({
          name: retryName,
          mimeType: 'application/pdf',
          buffer: minimalPdf,
        });
        const firstPrepareResponse = await firstPrepare;
        expect(firstPrepareResponse.ok()).toBe(true);
        const initialPrepared = preparedUploadEvidence(await firstPrepareResponse.json());
        initialSessionId = initialPrepared.sessionId;

        const retryItem = page.getByRole('listitem').filter({ hasText: retryName });
        await expect(retryItem).toContainText('Failed', { timeout: 15_000 });
        await expect(retryItem.getByRole('alert')).toHaveText('The upload failed. Try again.');

        transportMode = 'allow';
        const oldSessionCancelled = page.waitForResponse(
          (response) =>
            response.request().method() === 'DELETE' &&
            new URL(response.url()).pathname.endsWith(`/${initialPrepared.sessionId}`),
        );
        const retryPreparedResponse = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            /\/v1\/uploads\/prepare(?:\?|$)/u.test(response.url()),
        );
        const retryFinalized = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            /\/v1\/uploads\/[^/]+\/finalize(?:\?|$)/u.test(response.url()),
        );
        await retryItem.getByRole('button', { name: /^retry$/i }).click();
        expect((await oldSessionCancelled).ok()).toBe(true);
        const retryPrepare = await retryPreparedResponse;
        expect(retryPrepare.ok()).toBe(true);
        const retriedPrepared = preparedUploadEvidence(await retryPrepare.json());
        const finalized = await retryFinalized;
        expect(finalized.ok()).toBe(true);
        await expect(retryItem.getByRole('status')).toContainText('Uploaded');

        expect(retriedPrepared.clientId).toBe(initialPrepared.clientId);
        expect(retriedPrepared.storageKey === initialPrepared.storageKey).toBe(false);
        expect(initialCancelRequests).toBe(1);

        transportMode = 'hold-cancel';
        const cancelPreparedResponse = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            /\/v1\/uploads\/prepare(?:\?|$)/u.test(response.url()),
        );
        await page.locator('input[type="file"]').setInputFiles({
          name: cancelName,
          mimeType: 'application/pdf',
          buffer: minimalPdf,
        });
        const cancelPrepare = await cancelPreparedResponse;
        expect(cancelPrepare.ok()).toBe(true);
        const cancelPrepared = preparedUploadEvidence(await cancelPrepare.json());
        cancelSessionId = cancelPrepared.sessionId;
        await heldTusSeen;

        const cancelItem = page.getByRole('listitem').filter({ hasText: cancelName });
        await expect(cancelItem).toContainText('Uploading');
        const cancelled = page.waitForResponse(
          (response) =>
            response.request().method() === 'DELETE' &&
            new URL(response.url()).pathname.endsWith(`/${cancelPrepared.sessionId}`),
        );
        await cancelItem.getByRole('button', { name: /^cancel$/i }).click();
        transportMode = 'abort-cancel';
        releaseHeldTus();
        expect((await cancelled).ok()).toBe(true);
        await expect(cancelItem).toContainText('Cancelled');

        expect(cancelRequests).toBe(1);
        expect(cancelFinalizations).toBe(0);
        expect(apiFacts.filter(({ kind }) => kind === 'prepare')).toHaveLength(3);
        expect(apiFacts.filter(({ kind }) => kind === 'finalize')).toHaveLength(1);
        expect(apiFacts.filter(({ kind }) => kind === 'cancel')).toHaveLength(2);
        for (const fact of apiFacts) {
          expect(fact.hasPdfBytes).toBe(false);
          expect(fact.hasCapabilityField).toBe(false);
          expect(fact.hasSignatureHeader).toBe(false);
        }
        for (const fact of apiFacts.filter(({ kind }) => kind === 'prepare')) {
          expect(fact.method).toBe('POST');
          expect(fact.bodyKeys).toEqual(['files', 'parentId']);
          expect(fact.fileKeys).toEqual(['clientId', 'mimeType', 'name', 'sizeBytes']);
          expect(fact.bodyLength).toBeGreaterThan(0);
        }
        const finalizeFact = apiFacts.find(({ kind }) => kind === 'finalize');
        expect(finalizeFact?.bodyKeys).toEqual(['clientId']);
        expect(finalizeFact?.bodyLength).toBeGreaterThan(0);
        for (const fact of apiFacts.filter(({ kind }) => kind === 'cancel'))
          expect(fact.bodyLength).toBe(0);
        expect(tusFacts.length).toBeGreaterThanOrEqual(3);
        expect(tusFacts.every(({ hasSignature }) => hasSignature)).toBe(true);
        expect(tusFacts.every(({ hasAuthorization }) => !hasAuthorization)).toBe(true);
        expect(tusFacts.every(({ usesDifferentOrigin }) => usesDifferentOrigin)).toBe(true);
      } finally {
        transportMode = 'abort-cancel';
        releaseHeldTus();
        await page.unroute('**/*', controlTusTransport);
        page.off('request', captureApiBoundary);
      }
    } finally {
      await context.close();
    }
  });

  test('Owner A: valid PDF, rename conflict, exact move destination, and delete impact', async ({
    browser,
  }) => {
    const context = await actorContext(browser, 'owner');
    try {
      const page = await context.newPage();
      const run = uniqueRunName('lifecycle');
      await page.goto('/');
      await createFolder(page, run);
      const destination = await createFolder(page, `${run}-destination`, { open: false });
      await uploadPdf(page, `${run}-conflict.pdf`);
      const agreement = await uploadPdf(page, `${run}-agreement.pdf`);

      const pdfResponse = page.waitForResponse((response) =>
        response.headers()['content-type']?.includes('application/pdf'),
      );
      await page.getByRole('link', { name: agreement.name, exact: true }).click();
      const response = await pdfResponse;
      expect(response.ok()).toBe(true);
      expect((await response.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
      await expect(
        page.getByRole('region', {
          name: new RegExp(`PDF (?:viewer|preview).*${escapeRegExp(agreement.name)}`, 'i'),
        }),
      ).toBeVisible();
      await page.goBack();

      const conflictResponse = page.waitForResponse(
        (item) =>
          item.request().method() === 'PATCH' && item.url().includes(`/nodes/${agreement.id}/name`),
      );
      await nodeAction(page, agreement.name).click();
      await page.getByRole('menuitem', { name: /rename/i }).click();
      const renameDialog = page.getByRole('dialog', { name: /rename/i });
      await renameDialog.getByRole('textbox', { name: /file name/i }).fill(`${run}-conflict.pdf`);
      await renameDialog.getByRole('button', { name: /save|rename/i }).click();
      expect((await conflictResponse).status()).toBe(409);
      await expect(renameDialog.getByRole('alert')).toContainText(/already exists|conflict/i);
      await expect(renameDialog.getByRole('button', { name: /use suggestion/i })).toBeVisible();

      const renamed = `${run}-agreement-renamed.pdf`;
      const renamedResponse = page.waitForResponse(
        (item) =>
          item.request().method() === 'PATCH' && item.url().includes(`/nodes/${agreement.id}/name`),
      );
      await renameDialog.getByRole('textbox', { name: /file name/i }).fill(renamed);
      await renameDialog.getByRole('button', { name: /save|rename/i }).click();
      expect((await renamedResponse).ok()).toBe(true);

      const moved = page.waitForResponse(
        (item) =>
          item.request().method() === 'POST' && item.url().includes(`/files/${agreement.id}/move`),
      );
      await nodeAction(page, renamed).click();
      await page.getByRole('menuitem', { name: /move/i }).click();
      const moveDialog = page.getByRole('dialog', { name: /move/i });
      await moveDialog.getByRole('button', { name: destination.name, exact: true }).click();
      await moveDialog.getByRole('button', { name: /move|confirm/i }).click();
      expect((await moved).ok()).toBe(true);
      await expect(page.getByRole('link', { name: renamed, exact: true })).toHaveCount(0);

      await openNode(page, destination);
      await expect(page.getByRole('link', { name: renamed, exact: true })).toBeVisible();
      const impactResponse = page.waitForResponse(
        (item) =>
          item.request().method() === 'GET' && item.url().includes(`/nodes/${agreement.id}/impact`),
      );
      await nodeAction(page, renamed).click();
      await page.getByRole('menuitem', { name: /delete/i }).click();
      const impact = await (await impactResponse).json();
      expect(impact).toMatchObject({
        rootNodeId: agreement.id,
        folderCount: 0,
        fileCount: 1,
        totalBytes: minimalPdf.length,
      });
      const deleteDialog = page.getByRole('dialog', { name: /delete/i });
      await expect(deleteDialog).toContainText(/1 file/i);
      await expect(deleteDialog).toContainText(String(minimalPdf.length));
      const deleted = page.waitForResponse(
        (item) =>
          item.request().method() === 'DELETE' && item.url().includes(`/nodes/${agreement.id}`),
      );
      await deleteDialog.getByRole('button', { name: /delete|confirm/i }).click();
      expect((await deleted).ok()).toBe(true);
      await expect(page.getByRole('link', { name: renamed, exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('Viewer B reads one known owner target and loses it on the next request after revoke', async ({
    browser,
  }) => {
    const owner = await actorContext(browser, 'owner');
    const viewer = await actorContext(browser, 'viewer');
    try {
      const ownerPage = await owner.newPage();
      await ownerPage.goto('/');
      const target = await createFolder(ownerPage, uniqueRunName('viewer-share'));
      const share = await shareWithViewer(ownerPage);

      const viewerPage = await viewer.newPage();
      const firstRead = waitForNodeRead(viewerPage, target.id);
      await viewerPage.goto(target.url);
      expect((await firstRead).ok()).toBe(true);
      await expect(viewerPage.getByRole('status')).toContainText(/read-only/i);
      await expect(viewerPage.getByRole('heading', { name: target.name })).toBeVisible();
      await expect(
        viewerPage.getByRole('button', { name: /new folder|upload|rename|move|delete|share/i }),
      ).toHaveCount(0);

      await revokeShare(ownerPage, share, share.recipient);
      const revokedRead = waitForNodeRead(viewerPage, target.id);
      await viewerPage.reload();
      expect([403, 404, 410]).toContain((await revokedRead).status());
      await expect(viewerPage.getByText(/revoked|no longer available/i)).toBeVisible();
      await expect(viewerPage.getByText(target.name, { exact: true })).toHaveCount(0);
    } finally {
      await viewer.close();
      await owner.close();
    }
  });

  test('Viewer B: Shared with me exposes only the permissioned target and stays read-only', async ({
    browser,
  }) => {
    const owner = await actorContext(browser, 'owner');
    const viewer = await actorContext(browser, 'viewer');
    try {
      const ownerPage = await owner.newPage();
      await ownerPage.goto('/');
      const target = await createFolder(ownerPage, uniqueRunName('shared-with-me'), {
        open: false,
      });
      await openNode(ownerPage, target);
      const descendant = await createFolder(ownerPage, uniqueRunName('shared-descendant'), {
        open: false,
      });
      await ownerPage.goto('/workspace');
      const sibling = await createFolder(ownerPage, uniqueRunName('shared-sibling'), {
        open: false,
      });
      await openNode(ownerPage, target);
      const share = await shareWithViewer(ownerPage);

      const viewerPage = await viewer.newPage();
      // Frozen sharing contract: the recipient discovers grants from the protected
      // "Shared with me" surface; the current route design remains /workspace/:nodeId.
      await viewerPage.goto('/workspace');
      const sharedLink = viewerPage.getByRole('link', { name: /shared with me/i });
      await expect(sharedLink).toBeVisible();
      await sharedLink.click();
      await expect(viewerPage.getByRole('link', { name: target.name, exact: true })).toBeVisible();
      await expect(
        viewerPage.getByRole('link', { name: descendant.name, exact: true }),
      ).toHaveCount(0);
      await expect(viewerPage.getByRole('link', { name: sibling.name, exact: true })).toHaveCount(
        0,
      );
      await viewerPage.getByRole('link', { name: target.name, exact: true }).click();
      await expect(viewerPage.getByRole('status')).toContainText(/read-only/i);
      await expect(
        viewerPage.getByRole('link', { name: descendant.name, exact: true }),
      ).toBeVisible();
      await expect(viewerPage.getByRole('link', { name: sibling.name, exact: true })).toHaveCount(
        0,
      );
      await expect(
        viewerPage.getByRole('button', { name: /new folder|upload|rename|move|delete|share/i }),
      ).toHaveCount(0);

      await revokeShare(ownerPage, share, share.recipient);
    } finally {
      await viewer.close();
      await owner.close();
    }
  });

  test('Viewer B cannot traverse from a shared nested target to its ancestor or sibling', async ({
    browser,
  }) => {
    const owner = await actorContext(browser, 'owner');
    const viewer = await actorContext(browser, 'viewer');
    try {
      const ownerPage = await owner.newPage();
      await ownerPage.goto('/');
      const ancestor = await createFolder(ownerPage, uniqueRunName('boundary-parent'));
      const target = await createFolder(ownerPage, uniqueRunName('boundary-target'), {
        open: false,
      });
      await ownerPage.goto('/workspace');
      const sibling = await createFolder(ownerPage, uniqueRunName('boundary-sibling'), {
        open: false,
      });
      await openNode(ownerPage, target);
      const targetUrl = ownerPage.url();
      const share = await shareWithViewer(ownerPage);

      const viewerPage = await viewer.newPage();
      const firstRead = waitForNodeRead(viewerPage, target.id);
      await viewerPage.goto(targetUrl);
      expect((await firstRead).ok()).toBe(true);
      await expect(viewerPage.getByRole('heading', { name: target.name })).toBeVisible();
      await expectNodeReadDenied(viewerPage, ancestor.id);
      await expectNodeReadDenied(viewerPage, sibling.id);
      await expect(viewerPage.getByText(ancestor.name, { exact: true })).toHaveCount(0);
      await expect(viewerPage.getByText(sibling.name, { exact: true })).toHaveCount(0);

      await revokeShare(ownerPage, share, share.recipient);
    } finally {
      await viewer.close();
      await owner.close();
    }
  });

  test('Unrelated User C is denied one exact owner resource without metadata', async ({
    browser,
  }) => {
    const owner = await actorContext(browser, 'owner');
    const unrelated = await actorContext(browser, 'unrelated');
    try {
      const ownerPage = await owner.newPage();
      await ownerPage.goto('/');
      const target = await createFolder(ownerPage, uniqueRunName('unrelated-denial'));

      const unrelatedPage = await unrelated.newPage();
      const denial = waitForNodeRead(unrelatedPage, target.id);
      await unrelatedPage.goto(target.url);
      expect([403, 404]).toContain((await denial).status());
      await expect(unrelatedPage.getByText(/forbidden|not authorized|not found/i)).toBeVisible();
      await expect(unrelatedPage.getByText(target.name, { exact: true })).toHaveCount(0);
    } finally {
      await unrelated.close();
      await owner.close();
    }
  });

  test('Owner A: core workspace remains usable at mobile and desktop widths', async ({
    browser,
  }) => {
    const context = await actorContext(browser, 'owner');
    try {
      const page = await context.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto('/');
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expect(page.locator('input[type="file"]')).toBeAttached();
      await expect(page.getByRole('button', { name: /new folder|create folder/i })).toBeVisible();
      expect(
        await page.evaluate(() => globalThis.document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);

      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('navigation').first()).toBeVisible();
      expect(
        await page.evaluate(() => globalThis.document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(1440);
    } finally {
      await context.close();
    }
  });

  test('Public link removes its fragment, caps the subtree, and fails after revoke', async ({
    browser,
  }) => {
    const owner = await actorContext(browser, 'owner');
    const anonymous = await browser.newContext();
    try {
      const ownerPage = await owner.newPage();
      await ownerPage.goto('/');
      await createFolder(ownerPage, uniqueRunName('public-container'));
      const target = await createFolder(ownerPage, uniqueRunName('public-target'), { open: false });
      const sibling = await createFolder(ownerPage, uniqueRunName('public-sibling'), {
        open: false,
      });
      await openNode(ownerPage, target);
      const descendant = await createFolder(ownerPage, uniqueRunName('public-descendant'), {
        open: false,
      });
      const sharedPdf = await uploadPdf(ownerPage, `${uniqueRunName('public-document')}.pdf`);
      const share = await createPublicShare(ownerPage);
      const issuedUrl = new URL(share.url);
      expect(issuedUrl.hash.length).toBeGreaterThan(1);
      expect(issuedUrl.searchParams.has('token')).toBe(false);
      const shareToken = publicShareToken(share.url);

      const tokenLeakLocations = new Set();
      const requestInspections = [];
      const responseInspections = [];
      let credentialRequestCount = 0;
      const inspectPublicRequest = (request) => {
        requestInspections.push(
          (async () => {
            if (request.url().includes(shareToken)) tokenLeakLocations.add('request URL');
            if (request.postData()?.includes(shareToken)) tokenLeakLocations.add('request body');
            const headers = await request.allHeaders();
            for (const [name, value] of Object.entries(headers)) {
              const normalizedName = name.toLowerCase();
              // The frozen public-read contract transports the fragment credential only here.
              if (normalizedName === 'x-share-token' && value === shareToken) {
                credentialRequestCount += 1;
              } else if (value.includes(shareToken)) {
                tokenLeakLocations.add(`request header: ${normalizedName}`);
              }
            }
            if (headers.authorization) tokenLeakLocations.add('authorization header');
          })(),
        );
      };
      const inspectPublicResponse = (response) => {
        responseInspections.push(
          (async () => {
            const headers = await response.allHeaders();
            for (const name of Object.keys(headers)) {
              if (headers[name].includes(shareToken)) {
                tokenLeakLocations.add(`response header: ${name.toLowerCase()}`);
              }
            }
          })(),
        );
      };
      anonymous.on('request', inspectPublicRequest);
      anonymous.on('response', inspectPublicResponse);
      const publicPage = await anonymous.newPage();
      const resolved = publicPage.waitForResponse((response) =>
        response.url().includes('/v1/public-share/'),
      );
      try {
        await publicPage.evaluate((targetUrl) => {
          globalThis.location.assign(targetUrl);
        }, share.url);
      } catch {
        throw new Error('Public fragment navigation failed before credential scrubbing.');
      }
      const resolvedResponse = await resolved;
      expect(resolvedResponse.ok()).toBe(true);
      await expect.poll(() => new URL(publicPage.url()).hash).toBe('');
      await expect(publicPage.getByRole('heading', { name: target.name })).toBeVisible();
      await expect(
        publicPage.getByRole('link', { name: descendant.name, exact: true }),
      ).toBeVisible();
      await expect(
        publicPage.getByRole('link', { name: sharedPdf.name, exact: true }),
      ).toBeVisible();
      await expect(publicPage.getByText(sibling.name, { exact: true })).toHaveCount(0);

      const traversalEndpoint = new URL(
        `/v1/nodes/${encodeURIComponent(sibling.id)}/children`,
        resolvedResponse.url(),
      ).toString();
      const traversalStatus = await publicPage.evaluate(
        async ({ endpoint, token }) => {
          const response = await globalThis.fetch(endpoint, {
            credentials: 'omit',
            headers: { 'X-Share-Token': token },
          });
          return response.status;
        },
        { endpoint: traversalEndpoint, token: shareToken },
      );
      expect([403, 404]).toContain(traversalStatus);
      await expect(publicPage.getByText(sibling.name, { exact: true })).toHaveCount(0);

      await revokeShare(ownerPage, share, 'public link');
      const revoked = publicPage.waitForResponse((response) =>
        response.url().includes('/v1/public-share/'),
      );
      await publicPage.reload();
      expect([401, 404, 410]).toContain((await revoked).status());
      await expect(publicPage.getByText(/revoked|invalid|no longer available/i)).toBeVisible();
      anonymous.off('request', inspectPublicRequest);
      anonymous.off('response', inspectPublicResponse);
      await Promise.all(requestInspections);
      await Promise.all(responseInspections);
      expect(credentialRequestCount).toBeGreaterThan(0);
      expect([...tokenLeakLocations]).toEqual([]);
    } finally {
      await anonymous.close();
      await owner.close();
    }
  });

  test('Delete while viewed gives Viewer B an explicit gone state on a new request', async ({
    browser,
  }) => {
    const owner = await actorContext(browser, 'owner');
    const viewer = await actorContext(browser, 'viewer');
    try {
      const ownerPage = await owner.newPage();
      await ownerPage.goto('/');
      const target = await createFolder(ownerPage, uniqueRunName('delete-viewed'));
      await shareWithViewer(ownerPage);

      const viewerPage = await viewer.newPage();
      const firstRead = waitForNodeRead(viewerPage, target.id);
      await viewerPage.goto(target.url);
      expect((await firstRead).ok()).toBe(true);
      await expect(viewerPage.getByRole('heading', { name: target.name })).toBeVisible();

      await ownerPage.goto('/');
      const impact = await deleteListedNode(ownerPage, target);
      expect(impact).toMatchObject({ rootNodeId: target.id, activeShareCount: 1 });

      const goneRead = waitForNodeRead(viewerPage, target.id);
      await viewerPage.reload();
      expect([404, 410]).toContain((await goneRead).status());
      await expect(viewerPage.getByText(/gone|revoked|no longer available/i)).toBeVisible();
      await expect(viewerPage.getByText(target.name, { exact: true })).toHaveCount(0);
    } finally {
      await viewer.close();
      await owner.close();
    }
  });
});
