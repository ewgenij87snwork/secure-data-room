import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createPermissionedShareRequestSchema,
  paginationQuerySchema,
  uuidSchema,
  type CreatePermissionedShareRequest,
  type PaginationQuery,
} from '@data-room/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Principal } from '../auth/principal.decorator.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SharesService } from './shares.service.js';
import { NodesReadService } from '../nodes/nodes-read.service.js';
import { NodesListService } from '../nodes/nodes-list.service.js';
import { NodesService } from '../nodes/nodes.service.js';

@Controller()
export class SharesController {
  constructor(
    private readonly shares: SharesService,
    private readonly reads: NodesReadService,
    private readonly lists: NodesListService,
    private readonly nodes: NodesService,
  ) {}

  @UseGuards(JwtAuthGuard) @Get('nodes/:nodeId/shares') list(
    @Principal() p: AuthenticatedPrincipal,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.shares.list(p, id);
  }
  @UseGuards(JwtAuthGuard) @Post('nodes/:nodeId/shares/public') createPublic(
    @Principal() p: AuthenticatedPrincipal,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.shares.createPublic(p, id);
  }
  @UseGuards(JwtAuthGuard) @Post('nodes/:nodeId/shares/users') createUser(
    @Principal() p: AuthenticatedPrincipal,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(createPermissionedShareRequestSchema))
    body: CreatePermissionedShareRequest,
  ) {
    return this.shares.createPermissioned(p, id, body);
  }
  @UseGuards(JwtAuthGuard) @Delete('shares/:shareId') revoke(
    @Principal() p: AuthenticatedPrincipal,
    @Param('shareId', new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.shares.revoke(p, id);
  }
  @UseGuards(JwtAuthGuard) @Get('shared-with-me') shared(
    @Principal() p: AuthenticatedPrincipal,
    @Query(new ZodValidationPipe(paginationQuerySchema)) q: PaginationQuery,
  ) {
    return this.shares.sharedWithMe(p, q.cursor, q.limit);
  }
  @Get('public-share/root') async root(@Headers('x-share-token') token: string | undefined) {
    const p = await this.shares.resolvePublic(token);
    return this.reads.getNode(p, p.targetNodeId);
  }
  @Get('public-share/nodes/:nodeId/children') async children(
    @Headers('x-share-token') token: string | undefined,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) id: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) q: PaginationQuery,
  ) {
    return this.lists.listChildren(await this.shares.resolvePublic(token), id, q);
  }
  @Post('public-share/files/:nodeId/view-url') async view(
    @Headers('x-share-token') token: string | undefined,
    @Param('nodeId', new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.nodes.createViewUrl(await this.shares.resolvePublic(token), id);
  }
}
