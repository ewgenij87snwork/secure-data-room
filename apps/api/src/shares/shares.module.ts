import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { RuntimeControlsModule } from '../runtime-controls/runtime-controls.module.js';
import { NodesModule } from '../nodes/nodes.module.js';
import { SharesController } from './shares.controller.js';
import { SharesService } from './shares.service.js';

@Module({
  imports: [PrismaModule, AuthModule, AccessControlModule, RuntimeControlsModule, NodesModule],
  controllers: [SharesController],
  providers: [SharesService],
})
export class SharesModule {}
