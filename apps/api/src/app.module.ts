import { Module } from '@nestjs/common';
import { PrismaModule } from './database/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { MeModule } from './me/me.module.js';

@Module({ imports: [PrismaModule, HealthModule, AuthModule, MeModule] })
export class AppModule {}
