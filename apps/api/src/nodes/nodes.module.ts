import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../database/prisma.module.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { RuntimeControlsModule } from '../runtime-controls/runtime-controls.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { NodesController } from './nodes.controller.js';
import { NodesService } from './nodes.service.js';
import { NodesListService } from './nodes-list.service.js';
import { NodesReadService } from './nodes-read.service.js';
import { DeleteService } from './delete.service.js';

@Module({
  imports: [PrismaModule, AuthModule, AccessControlModule, RuntimeControlsModule, StorageModule],
  controllers: [NodesController],
  providers: [NodesService, NodesListService, NodesReadService, DeleteService],
  exports: [NodesService],
})
export class NodesModule {}
