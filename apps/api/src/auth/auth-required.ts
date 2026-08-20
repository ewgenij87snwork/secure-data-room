import { UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export function authRequired(): UnauthorizedException {
  return new UnauthorizedException({
    error: {
      code: 'AUTH_REQUIRED',
      message: 'Authentication is required.',
      requestId: randomUUID(),
    },
  });
}
