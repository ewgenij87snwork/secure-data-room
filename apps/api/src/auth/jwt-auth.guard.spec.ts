import type { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { base64url, createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { AUTH_CONFIG, issuerJwksUrl, type AuthConfig } from './auth.config.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwksTokenVerifier } from './jwks-token-verifier.js';
import { principalFromContext } from './principal.decorator.js';

const issuer = 'https://example.supabase.co/auth/v1';
const audience = 'authenticated';
const subject = '123e4567-e89b-12d3-a456-426614174000';

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: 'Owner@Example.com',
    role: 'authenticated',
    is_anonymous: false,
    sub: subject,
    iss: issuer,
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

async function fixture(algorithm: 'ES256' | 'RS256' = 'RS256') {
  const { privateKey, publicKey } = await generateKeyPair(algorithm);
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  const config: AuthConfig = {
    issuer,
    audience,
    jwks: createLocalJWKSet({ keys: [jwk] }),
  };
  const token = (claims: Record<string, unknown> = {}) =>
    new SignJWT(validClaims(claims))
      .setProtectedHeader({ alg: algorithm, kid: 'test-key' })
      .setIssuedAt()
      .sign(privateKey);
  return { config, token };
}

function context(headers: Record<string, string> = {}) {
  const request: Record<string, unknown> = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    request,
  } as unknown as ExecutionContext & { request: Record<string, unknown> };
}

async function expectAuthRequired(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    response: { error: { code: 'AUTH_REQUIRED' } },
    status: 401,
  });
}

function captureThrown(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the action to throw.');
}

describe('JwksTokenVerifier', () => {
  it.each(['ES256', 'RS256'] as const)(
    'verifies a signed %s token and returns a normalized immutable principal',
    async (algorithm) => {
      const { config, token } = await fixture(algorithm);
      const principal = await new JwksTokenVerifier(config).verify(await token());

      expect(principal).toEqual({
        kind: 'authenticated',
        userId: subject,
        email: 'owner@example.com',
      });
      expect(Object.isFrozen(principal)).toBe(true);
    },
  );

  it.each([
    ['expired token', { exp: Math.floor(Date.now() / 1000) - 1 }],
    ['wrong issuer', { iss: 'https://evil.example/issuer' }],
    ['wrong audience', { aud: 'wrong-audience' }],
    ['missing expiration', { exp: undefined }],
    ['missing email', { email: undefined }],
    ['malformed email', { email: 'not-an-email' }],
    ['invalid subject', { sub: 'user-123' }],
    ['wrong role', { role: 'admin' }],
    ['anonymous user', { is_anonymous: true }],
    [
      'metadata cannot authorize',
      {
        role: undefined,
        is_anonymous: undefined,
        user_metadata: { role: 'authenticated', is_anonymous: false },
      },
    ],
  ])('rejects %s', async (_name, claims) => {
    const { config, token } = await fixture();
    await expectAuthRequired(new JwksTokenVerifier(config).verify(await token(claims)));
  });

  it('rejects a token signed by an untrusted key with the same key id', async () => {
    const trusted = await fixture();
    const untrusted = await fixture();

    await expectAuthRequired(new JwksTokenVerifier(trusted.config).verify(await untrusted.token()));
  });

  it('rejects a correctly signed PS256 token', async () => {
    const { privateKey, publicKey } = await generateKeyPair('PS256');
    const jwk = await exportJWK(publicKey);
    jwk.kid = 'ps-key';
    const token = await new SignJWT(validClaims())
      .setProtectedHeader({ alg: 'PS256', kid: 'ps-key' })
      .sign(privateKey);

    await expectAuthRequired(
      new JwksTokenVerifier({
        issuer,
        audience,
        jwks: createLocalJWKSet({ keys: [jwk] }),
      }).verify(token),
    );
  });

  it('rejects a correctly signed HS256 token', async () => {
    const secret = new TextEncoder().encode('01234567890123456789012345678901');
    const token = await new SignJWT(validClaims())
      .setProtectedHeader({ alg: 'HS256', kid: 'symmetric-key' })
      .sign(secret);

    await expectAuthRequired(
      new JwksTokenVerifier({
        issuer,
        audience,
        jwks: () => Promise.resolve(secret),
      }).verify(token),
    );
  });

  it('rejects an unsecured token using the none algorithm', async () => {
    const token = `${base64url.encode(JSON.stringify({ alg: 'none' }))}.${base64url.encode(
      JSON.stringify(validClaims()),
    )}.`;

    await expectAuthRequired(
      new JwksTokenVerifier({
        issuer,
        audience,
        jwks: () => Promise.resolve(new Uint8Array(32)),
      }).verify(token),
    );
  });
});

describe('issuer and decorator boundary', () => {
  it('derives the issuer-relative JWKS URL and rejects issuer path confusion', () => {
    expect(issuerJwksUrl(issuer).toString()).toBe(`${issuer}/.well-known/jwks.json`);
    expect(() => issuerJwksUrl('https://example.supabase.co/other')).toThrow();
    expect(() => issuerJwksUrl(`${issuer}?jwks=https://evil.example`)).toThrow();
  });

  it('allows a loopback HTTP issuer only when local development explicitly enables it', () => {
    const localIssuer = 'http://127.0.0.1:54321/auth/v1';
    expect(issuerJwksUrl(localIssuer, true).toString()).toBe(
      'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json',
    );
    expect(() => issuerJwksUrl(localIssuer, false)).toThrow();
    expect(() => issuerJwksUrl(localIssuer)).toThrow();
    expect(() => issuerJwksUrl('http://example.com/auth/v1', true)).toThrow();
  });

  it('fails closed when no guard-established principal exists', () => {
    expect(captureThrown(() => principalFromContext(context()))).toMatchObject({
      response: { error: { code: 'AUTH_REQUIRED' } },
      status: 401,
    });
  });

  it('rejects a frozen object that merely resembles a principal', () => {
    const executionContext = context();
    executionContext.request.user = Object.freeze({
      kind: 'authenticated',
      userId: subject,
      email: 'owner@example.com',
    });

    expect(captureThrown(() => principalFromContext(executionContext))).toMatchObject({
      response: { error: { code: 'AUTH_REQUIRED' } },
      status: 401,
    });
  });

  it('resolves the verifier and guard through the Nest testing module', async () => {
    const { config } = await fixture();
    const module = await Test.createTestingModule({
      providers: [{ provide: AUTH_CONFIG, useValue: config }, JwksTokenVerifier, JwtAuthGuard],
    }).compile();
    expect(module.get(JwtAuthGuard)).toBeInstanceOf(JwtAuthGuard);
  });
});

describe('JwtAuthGuard', () => {
  it('attaches only the verified principal for a valid Bearer token', async () => {
    const { config, token } = await fixture();
    const verifier = new JwksTokenVerifier(config);
    const requestContext = context({
      authorization: `Bearer ${await token()}`,
      'x-user-id': 'attacker',
    });

    await expect(new JwtAuthGuard(verifier).canActivate(requestContext)).resolves.toBe(true);
    expect(requestContext.request.user).toEqual({
      kind: 'authenticated',
      userId: subject,
      email: 'owner@example.com',
    });
    expect(requestContext.request.user).not.toBe('attacker');
  });

  it.each([
    ['missing Authorization', undefined],
    ['malformed Authorization', 'Bearer'],
    ['non-Bearer Authorization', 'Basic abc'],
  ])('rejects %s', async (_name, authorization) => {
    const { config } = await fixture();
    const requestContext = context(authorization ? { authorization } : {});

    await expectAuthRequired(
      new JwtAuthGuard(new JwksTokenVerifier(config)).canActivate(requestContext),
    );
  });
});
