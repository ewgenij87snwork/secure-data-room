import type { JWTVerifyGetKey } from 'jose';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export interface AuthConfig {
  issuer: string;
  audience: string;
  jwks?: JWTVerifyGetKey;
  allowInsecureLoopbackIssuer?: boolean;
}

const localIssuerHosts = new Set(['127.0.0.1', '[::1]', 'localhost']);

export function issuerJwksUrl(issuer: string, allowInsecureLoopback = false): URL {
  const parsed = new URL(issuer);
  const issuerPath = parsed.pathname.replace(/\/+$/u, '');
  const isSecureIssuer = parsed.protocol === 'https:';
  const isLocalIssuer =
    allowInsecureLoopback && parsed.protocol === 'http:' && localIssuerHosts.has(parsed.hostname);
  if (
    (!isSecureIssuer && !isLocalIssuer) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    issuerPath !== '/auth/v1'
  ) {
    throw new Error('Invalid Supabase JWT issuer.');
  }
  parsed.pathname = `${issuerPath}/.well-known/jwks.json`;
  return parsed;
}
