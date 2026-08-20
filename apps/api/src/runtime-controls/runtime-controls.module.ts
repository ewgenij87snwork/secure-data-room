import { Module } from '@nestjs/common';
import { RuntimeControlsService } from './runtime-controls.service.js';

@Module({ providers: [RuntimeControlsService], exports: [RuntimeControlsService] })
export class RuntimeControlsModule {}
