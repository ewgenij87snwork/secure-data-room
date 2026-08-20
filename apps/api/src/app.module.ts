import { Module } from '@nestjs/common';
import { PrismaModule } from './database/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({ imports: [PrismaModule, HealthModule, AuthModule] })
export class AppModule {}
