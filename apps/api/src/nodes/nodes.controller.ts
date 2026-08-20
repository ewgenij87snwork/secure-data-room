import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { createFolderRequestSchema, type CreateFolderRequest } from '@data-room/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Principal } from '../auth/principal.decorator.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { NodesService } from './nodes.service.js';

@Controller('folders')
@UseGuards(JwtAuthGuard)
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Post()
  createFolder(
    @Principal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(createFolderRequestSchema)) body: CreateFolderRequest,
  ) {
    return this.nodesService.createFolder(principal, body);
  }
}
