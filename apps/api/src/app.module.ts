import { Module } from '@nestjs/common';
import { PrismaModule } from './database/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { MeModule } from './me/me.module.js';
import { AccessControlModule } from './access-control/access-control.module.js';
import { NodesModule } from './nodes/nodes.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { CleanupModule } from './cleanup/cleanup.module.js';
import { SharesModule } from './shares/shares.module.js';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    MeModule,
    AccessControlModule,
    NodesModule,
    UploadsModule,
    CleanupModule,
    SharesModule,
  ],
})
export class AppModule {}
