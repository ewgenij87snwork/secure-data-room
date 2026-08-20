import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { PrismaModule } from '../database/prisma.module.js';
import { RuntimeControlsModule } from '../runtime-controls/runtime-controls.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';
import { UploadQuotaService } from './upload-quota.service.js';

@Module({
  imports: [PrismaModule, AuthModule, AccessControlModule, RuntimeControlsModule, StorageModule],
  controllers: [UploadsController],
  providers: [UploadsService, UploadQuotaService],
})
export class UploadsModule {}
