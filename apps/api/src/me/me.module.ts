import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';
import { RuntimeControlsModule } from '../runtime-controls/runtime-controls.module.js';

@Module({
  imports: [AuthModule, RuntimeControlsModule],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService],
})
export class MeModule {}
