import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import {
  finalizeUploadRequestSchema,
  prepareUploadRequestSchema,
  uuidSchema,
  type FinalizeUploadResponse,
  type PrepareUploadRequest,
} from '@data-room/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Principal } from '../auth/principal.decorator.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UploadsService } from './uploads.service.js';

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('prepare')
  prepare(
    @Principal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(prepareUploadRequestSchema)) body: PrepareUploadRequest,
  ) {
    return this.uploads.prepare(principal, body);
  }

  @Post(':sessionId/finalize')
  finalize(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('sessionId', new ZodValidationPipe(uuidSchema)) sessionId: string,
    @Body(new ZodValidationPipe(finalizeUploadRequestSchema)) body: { clientId: string },
  ): Promise<FinalizeUploadResponse> {
    return this.uploads.finalize(principal, sessionId, body);
  }

  @Delete(':sessionId')
  async cancel(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('sessionId', new ZodValidationPipe(uuidSchema)) sessionId: string,
  ): Promise<void> {
    await this.uploads.cancel(principal, sessionId);
  }
}
