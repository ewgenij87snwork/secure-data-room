import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { expect } from '@playwright/test';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function buildMinimalPdf() {
  const content = 'BT\n/F1 12 Tf\n72 72 Td\n(Secure Data Room fixture) Tj\nET';
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let document = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(document, 'latin1'));
    document += object;
  }

  const crossReferenceOffset = Buffer.byteLength(document, 'latin1');
  document += `xref\n0 ${objects.length + 1}\n`;
  document += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  document += `startxref\n${crossReferenceOffset}\n%%EOF\n`;
  return Buffer.from(document, 'latin1');
}

export const minimalPdf = buildMinimalPdf();

export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required E2E variable is absent: ${name}`);
  return value;
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function uniqueRunName(label) {
  return `${requiredEnv('E2E_RUN_ID')}-${label}`;
}

export async function actorContext(browser, name) {
  return browser.newContext({
    storageState: requiredEnv(`E2E_${name.toUpperCase()}_STORAGE_STATE`),
  });
}

export async function assertActorIdentity(browser, name) {
  const context = await actorContext(browser, name);
  try {
    const page = await context.newPage();
    const bootstrapped = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/v1\/me\/bootstrap(?:\?|$)/u.test(response.url()),
    );
    await page.goto('/');
    const response = await bootstrapped;
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(uuidPattern.test(body?.user?.id)).toBe(true);
    const actualEmail = body?.user?.email;
    const configuredEmail = requiredEnv(`E2E_${name.toUpperCase()}_EMAIL`);
    expect(
      typeof actualEmail === 'string' &&
        actualEmail.trim().toLowerCase() === configuredEmail.trim().toLowerCase(),
    ).toBe(true);
  } finally {
    await context.close();
  }
}

function responseNodeId(body) {
  const nodeId = body?.id ?? body?.node?.id ?? body?.nodeId;
  assert.equal(typeof nodeId, 'string', 'Node response must include an id.');
  assert.match(nodeId, uuidPattern, 'Node response id must be a UUID.');
  return nodeId;
}

export async function createFolder(page, name, { open = true } = {}) {
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && /\/v1\/folders(?:\?|$)/u.test(response.url()),
  );
  await page.getByRole('button', { name: /new folder|create folder/i }).click();
  const dialog = page.getByRole('dialog', { name: /new folder|create folder/i });
  await dialog.getByRole('textbox', { name: /folder name/i }).fill(name);
  await dialog.getByRole('button', { name: /create|save/i }).click();

  const response = await created;
  expect(response.ok()).toBe(true);
  const nodeId = responseNodeId(await response.json());
  const link = page.getByRole('link', { name, exact: true });
  await expect(link).toBeVisible();
  if (open) {
    await link.click();
    await expect(page).toHaveURL(new RegExp(escapeRegExp(nodeId), 'u'));
  }
  return { id: nodeId, name, url: open ? page.url() : null };
}

export async function openNode(page, node) {
  await page.getByRole('link', { name: node.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(escapeRegExp(node.id), 'u'));
  return page.url();
}

export async function uploadPdf(page, fileName) {
  const finalized = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/v1\/uploads\/[^/]+\/finalize(?:\?|$)/u.test(response.url()),
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'application/pdf',
    buffer: minimalPdf,
  });
  const response = await finalized;
  expect(response.ok()).toBe(true);
  const body = await response.json();
  return { id: responseNodeId(body), name: body.finalName ?? fileName };
}

export function waitForNodeRead(page, nodeId) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url().includes(`/v1/nodes/${encodeURIComponent(nodeId)}`),
  );
}

export async function cleanupRunNodes(page) {
  // Every journey owns one run-prefixed root. Root deletion is recursive by contract,
  // so proving no such root remains also proves the run namespace is unreachable.
  const prefix = `${requiredEnv('E2E_RUN_ID')}-`;
  const actionName = new RegExp(`^${escapeRegExp(prefix)}.+ actions$`, 'i');
  const remainingLinks = page.getByRole('link', {
    name: new RegExp(`^${escapeRegExp(prefix)}`, 'i'),
  });
  await page.goto('/');

  for (let deleted = 0; deleted < 20; deleted += 1) {
    const action = page.getByRole('button', { name: actionName }).first();
    if ((await action.count()) === 0) {
      await expect(remainingLinks).toHaveCount(0);
      return;
    }
    await action.click();
    const impact = page.waitForResponse(
      (response) => response.request().method() === 'GET' && response.url().includes('/impact'),
    );
    await page.getByRole('menuitem', { name: /delete/i }).click();
    expect((await impact).ok()).toBe(true);
    const deletion = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' && response.url().includes('/v1/nodes/'),
    );
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /delete|confirm/i })
      .click();
    expect((await deletion).ok()).toBe(true);
  }

  if ((await remainingLinks.count()) === 0) return;
  throw new Error(`E2E cleanup exceeded its bounded limit for prefix ${prefix}`);
}
