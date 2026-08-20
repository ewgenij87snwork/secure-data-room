import { Module } from '@nestjs/common';
import { PrismaModule } from './database/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { MeModule } from './me/me.module.js';
import { AccessControlModule } from './access-control/access-control.module.js';

@Module({ imports: [PrismaModule, HealthModule, AuthModule, MeModule, AccessControlModule] })
export class AppModule {}
