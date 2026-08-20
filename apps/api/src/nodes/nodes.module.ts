import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../database/prisma.module.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { RuntimeControlsModule } from '../runtime-controls/runtime-controls.module.js';
import { NodesController } from './nodes.controller.js';
import { NodesService } from './nodes.service.js';
import { NodesListService } from './nodes-list.service.js';
import { NodesReadService } from './nodes-read.service.js';

@Module({
  imports: [PrismaModule, AuthModule, AccessControlModule, RuntimeControlsModule],
  controllers: [NodesController],
  providers: [NodesService, NodesListService, NodesReadService],
  exports: [NodesService],
})
export class NodesModule {}
