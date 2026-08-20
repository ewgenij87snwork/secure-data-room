import { HttpException } from '@nestjs/common';
import type { HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ApiErrorCode } from '@data-room/contracts';

export class ApiException extends HttpException {
  constructor(
    code: ApiErrorCode,
    status: HttpStatus,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(
      {
        error: {
          code,
          message,
          requestId: randomUUID(),
          ...(details ? { details } : {}),
        },
      },
      status,
    );
  }
}
