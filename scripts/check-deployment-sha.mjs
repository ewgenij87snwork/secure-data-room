import process from 'node:process';
import { pathToFileURL } from 'node:url';

function nonempty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is missing`);
  return value.trim();
}

function gitCommitSha(value, label) {
  const sha = nonempty(value, label);
  if (!/^[0-9a-f]{40}$/iu.test(sha)) throw new Error(`${label} is not a full Git commit SHA`);
  return sha.toLowerCase();
}

export function extractWebBuildSha(html) {
  const tags = String(html).match(/<meta\b[^>]*>/giu) ?? [];
  for (const tag of tags) {
    const name = /\bname\s*=\s*["']([^"']+)["']/iu.exec(tag)?.[1];
    if (name?.trim().toLowerCase() !== 'data-room-build-sha') continue;
    return gitCommitSha(/\bcontent\s*=\s*["']([^"']*)["']/iu.exec(tag)?.[1], 'Web build SHA');
  }
  throw new Error('Web build SHA is missing');
}

export function extractApiBuildSha(payload) {
  return gitCommitSha(payload?.commit, 'API build SHA');
}

export function compareBuildShas(webSha, apiSha) {
  const web = gitCommitSha(webSha, 'Web build SHA');
  const api = gitCommitSha(apiSha, 'API build SHA');
  if (web !== api) throw new Error('Web and API build SHAs do not match');
  return web;
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export async function verifyDeploymentSha(webUrl, apiUrl, fetchImpl = fetch) {
  const web = new URL(nonempty(webUrl, 'Web URL'));
  const api = new URL('/v1/health/version', nonempty(apiUrl, 'API URL'));
  const [webResponse, apiResponse] = await Promise.all([fetchImpl(web), fetchImpl(api)]);
  if (!webResponse.ok) throw new Error('Web deployment probe failed');
  if (!apiResponse.ok) throw new Error('API version probe failed');
  const [html, payload] = await Promise.all([webResponse.text(), apiResponse.json()]);
  return compareBuildShas(extractWebBuildSha(html), extractApiBuildSha(payload));
}

async function main() {
  const args = process.argv.slice(2);
  const webUrl =
    argumentValue(args, '--web-url') ?? process.env.E2E_WEB_URL ?? process.env.E2E_DEPLOYED_URL;
  const apiUrl = argumentValue(args, '--api-url') ?? process.env.E2E_API_URL;
  const sha = await verifyDeploymentSha(webUrl, apiUrl);
  process.stdout.write(`Deployment SHA verified: ${sha}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Deployment SHA check failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
