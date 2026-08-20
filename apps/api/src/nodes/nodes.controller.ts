import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createFolderRequestSchema,
  moveFileRequestSchema,
  paginationQuerySchema,
  uuidSchema,
  type CreateFolderRequest,
  type PaginationQuery,
  renameNodeRequestSchema,
  type RenameNodeRequest,
} from '@data-room/contracts';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Principal } from '../auth/principal.decorator.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { NodesService } from './nodes.service.js';
import { NodesListService } from './nodes-list.service.js';
import { NodesReadService } from './nodes-read.service.js';
import { DeleteService } from './delete.service.js';

type MoveFileRequest = z.infer<typeof moveFileRequestSchema>;

@Controller()
@UseGuards(JwtAuthGuard)
export class NodesController {
  constructor(
    private readonly nodesService: NodesService,
    private readonly nodesListService: NodesListService,
    private readonly nodesReadService: NodesReadService,
    private readonly deleteService: DeleteService,
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

  @Get('nodes/:nodeId')
  getNode(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) nodeId: string,
  ) {
    return this.nodesReadService.getNode(principal, nodeId);
  }

  @Get('nodes/:nodeId/breadcrumbs')
  getBreadcrumbs(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) nodeId: string,
  ) {
    return this.nodesReadService.getBreadcrumbs(principal, nodeId);
  }

  @Patch('nodes/:nodeId/name')
  renameNode(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) nodeId: string,
    @Body(new ZodValidationPipe(renameNodeRequestSchema)) body: RenameNodeRequest,
  ) {
    return this.nodesService.renameNode(principal, nodeId, body);
  }

  @Post('files/:nodeId/move')
  moveFile(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) nodeId: string,
    @Body(new ZodValidationPipe(moveFileRequestSchema)) body: MoveFileRequest,
  ) {
    return this.nodesService.moveFile(principal, nodeId, body);
  }

  @Post('files/:nodeId/view-url')
  createViewUrl(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) nodeId: string,
  ) {
    return this.nodesService.createViewUrl(principal, nodeId);
  }

  @Get('nodes/:nodeId/delete-impact')
  getDeleteImpact(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) nodeId: string,
  ) {
    return this.deleteService.getDeleteImpact(principal, nodeId);
  }

  @Delete('nodes/:nodeId')
  deleteNode(
    @Principal() principal: AuthenticatedPrincipal,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) nodeId: string,
  ) {
    return this.deleteService.deleteNode(principal, nodeId);
  }
}
