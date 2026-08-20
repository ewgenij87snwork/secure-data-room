import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  createFolderRequestSchema,
  paginationQuerySchema,
  uuidSchema,
  type CreateFolderRequest,
  type PaginationQuery,
} from '@data-room/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Principal } from '../auth/principal.decorator.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { NodesService } from './nodes.service.js';
import { NodesListService } from './nodes-list.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class NodesController {
  constructor(
    private readonly nodesService: NodesService,
    private readonly nodesListService: NodesListService,
  ) {}

  @Post('folders')
  createFolder(
    @Principal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(createFolderRequestSchema)) body: CreateFolderRequest,
  ) {
    return this.nodesService.createFolder(principal, body);
  }

  @Get('nodes/:nodeId/children')
  listChildren(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) nodeId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.nodesListService.listChildren(principal, nodeId, query);
  }
}
