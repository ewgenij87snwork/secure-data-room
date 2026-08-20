import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { CleanupService } from './cleanup.service.js';

@Module({
  imports: [PrismaModule, StorageModule],
  providers: [CleanupService],
  exports: [CleanupService],
})
export class CleanupModule {}
