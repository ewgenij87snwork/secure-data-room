import { readFileSync, realpathSync, statSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

const actors = [
  { state: 'E2E_OWNER_STORAGE_STATE', email: 'E2E_OWNER_EMAIL' },
  { state: 'E2E_VIEWER_STORAGE_STATE', email: 'E2E_VIEWER_EMAIL' },
  { state: 'E2E_UNRELATED_STORAGE_STATE', email: 'E2E_UNRELATED_EMAIL' },
];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function runtimeMode() {
  return process.env.E2E_MODE ?? 'local';
}

function requiredVariables() {
  const variables = ['E2E_RUN_ID'];
  variables.push(runtimeMode() === 'deployed' ? 'E2E_DEPLOYED_URL' : 'E2E_BASE_URL');
  for (const actor of actors) variables.push(actor.state, actor.email);
  return variables;
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function storageIdentity(path) {
  const state = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(state?.cookies) || !Array.isArray(state?.origins)) {
    throw new Error('invalid storage state');
  }

  for (const origin of state.origins) {
    if (!Array.isArray(origin?.localStorage)) continue;
    for (const item of origin.localStorage) {
      if (typeof item?.value !== 'string') continue;
      try {
        const stored = JSON.parse(item.value);
        const user = stored?.user ?? stored?.session?.user ?? stored?.currentSession?.user;
        if (
          typeof user?.id === 'string' &&
          uuidPattern.test(user.id) &&
          typeof user?.email === 'string'
        ) {
          return { id: user.id, email: user.email.trim().toLowerCase() };
        }
      } catch {
        // A storage state may contain unrelated non-JSON values.
      }
    }
  }
  throw new Error('authenticated identity is absent');
}

export default function globalSetup() {
  const invalid = new Set(requiredVariables().filter((name) => !process.env[name]?.trim()));
  const mode = runtimeMode();
  if (!['deployed', 'local'].includes(mode)) invalid.add('E2E_MODE');

  const runId = process.env.E2E_RUN_ID?.trim();
  if (runId && !/^[A-Za-z0-9][A-Za-z0-9_-]{5,47}$/u.test(runId)) invalid.add('E2E_RUN_ID');

  const configuredEmails = [];
  for (const actor of actors) {
    const email = process.env[actor.email]?.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) invalid.add(actor.email);
    if (email) configuredEmails.push({ variable: actor.email, value: email });
  }
  if (
    configuredEmails.length === actors.length &&
    new Set(configuredEmails.map(({ value }) => value)).size !== actors.length
  ) {
    for (const { variable } of configuredEmails) invalid.add(variable);
  }

  const baseUrlVariable = mode === 'deployed' ? 'E2E_DEPLOYED_URL' : 'E2E_BASE_URL';
  const baseUrl = process.env[baseUrlVariable]?.trim();
  if (baseUrl && !isHttpUrl(baseUrl)) invalid.add(baseUrlVariable);

  const resolvedStates = [];
  for (const actor of actors) {
    const value = process.env[actor.state]?.trim();
    if (!value) continue;
    try {
      if (!statSync(value).isFile()) throw new Error('not a file');
      const path = realpathSync(value);
      const identity = storageIdentity(path);
      const configuredEmail = process.env[actor.email]?.trim().toLowerCase();
      if (configuredEmail && identity.email !== configuredEmail) {
        invalid.add(actor.state);
        invalid.add(actor.email);
      }
      resolvedStates.push({ actor, path, identity });
    } catch {
      invalid.add(actor.state);
    }
  }

  if (
    resolvedStates.length === actors.length &&
    (new Set(resolvedStates.map(({ path }) => path)).size !== actors.length ||
      new Set(resolvedStates.map(({ identity }) => identity.id)).size !== actors.length)
  ) {
    for (const { actor } of resolvedStates) invalid.add(actor.state);
  }

  if (invalid.size > 0) {
    throw new Error(`E2E execution prerequisites are invalid: ${[...invalid].sort().join(', ')}`);
  }
}
