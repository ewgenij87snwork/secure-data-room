import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ApiException } from './api-exception.js';

@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new ApiException(
      'VALIDATION_FAILED',
      HttpStatus.BAD_REQUEST,
      'Request validation failed.',
    );
  }
}
