import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { AccessPolicyService } from './access-policy.service.js';

@Module({
  imports: [PrismaModule],
  providers: [AccessPolicyService],
  exports: [AccessPolicyService],
})
export class AccessControlModule {}
