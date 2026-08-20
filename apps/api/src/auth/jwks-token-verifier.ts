import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { authRequired } from './auth-required.js';
import { AUTH_CONFIG, issuerJwksUrl, type AuthConfig } from './auth.config.js';
import { authenticatedPrincipal, type AuthenticatedPrincipal } from './principal.js';

@Injectable()
export class JwksTokenVerifier {
  private readonly jwks: JWTVerifyGetKey;

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {
    if (config.jwks) {
      this.jwks = config.jwks;
    } else {
      this.jwks = createRemoteJWKSet(
        issuerJwksUrl(config.issuer, config.allowInsecureLoopbackIssuer === true),
      );
    }
  }

  async verify(token: string): Promise<AuthenticatedPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        algorithms: ['ES256', 'RS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        requiredClaims: ['exp'],
      });
      const userId = z.uuid().safeParse(payload.sub).success ? payload.sub : null;
      const rawEmail =
        typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
      const email = rawEmail && z.email().safeParse(rawEmail).success ? rawEmail : null;
      if (!userId || !email || payload.role !== 'authenticated' || payload.is_anonymous !== false) {
        throw authRequired();
      }
      return authenticatedPrincipal(userId, email);
    } catch {
      throw authRequired();
    }
  }
}
