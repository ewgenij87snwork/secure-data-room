import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { authRequired } from './auth-required.js';
import { isAuthenticatedPrincipal, type AuthenticatedPrincipal } from './principal.js';

export function principalFromContext(context: ExecutionContext): AuthenticatedPrincipal {
  const user = context.switchToHttp().getRequest<{ user?: unknown }>().user;
  if (!isAuthenticatedPrincipal(user)) throw authRequired();
  return user;
}

export const Principal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal =>
    principalFromContext(context),
);
