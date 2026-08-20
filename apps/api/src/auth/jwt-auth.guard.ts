import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { authRequired } from './auth-required.js';
import { JwksTokenVerifier } from './jwks-token-verifier.js';
import type { AuthenticatedPrincipal } from './principal.js';

interface AuthenticatedRequest {
  headers?: Record<string, string | string[] | undefined>;
  user?: AuthenticatedPrincipal;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly verifier: JwksTokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers?.authorization;
    if (typeof authorization !== 'string') throw authRequired();

    const match = /^Bearer\s+(\S+)$/u.exec(authorization);
    if (!match?.[1]) throw authRequired();

    request.user = await this.verifier.verify(match[1]);
    return true;
  }
}
