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
  expect(token.length).toBeGreaterThanOrEqual(40);
  expect(/\s/u.test(token)).toBe(false);
  return token;
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
  const dialog = page.getByRole('dialog', { name: /share access/i });
  await dialog.getByRole('textbox', { name: /recipient email/i }).fill(viewerEmail);
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
  const dialog = page.getByRole('dialog', { name: /share access/i });
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
  const dialog = page.getByRole('dialog', { name: /share access/i });
  await dialog
    .getByRole('button', {
      name: new RegExp(`revoke.*${escapeRegExp(accessibleName)}`, 'i'),
    })
    .click();
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
          item.request().method() === 'PATCH' && item.url().includes(`/nodes/${agreement.id}/move`),
      );
      await nodeAction(page, renamed).click();
      await page.getByRole('menuitem', { name: /move/i }).click();
      const moveDialog = page.getByRole('dialog', { name: /move/i });
      await moveDialog.getByRole('option', { name: destination.name, exact: true }).click();
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
      await expect(viewerPage.getByRole('banner')).toContainText(/read-only/i);
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
        response.url().includes('/v1/public/'),
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
        response.url().includes('/v1/public/'),
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
