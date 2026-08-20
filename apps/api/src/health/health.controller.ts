import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { getEnv } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';

interface HealthResponse {
  status: 'ok';
  version: string;
  commit: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOkResponse({ description: 'The process is accepting requests.' })
  getLive(): HealthResponse {
    const env = getEnv();
    return { status: 'ok', version: env.APP_VERSION, commit: env.GIT_COMMIT_SHA };
  }

  @Get('ready')
  @ApiOkResponse({ description: 'The process can reach the application database.' })
  @ApiServiceUnavailableResponse({ description: 'The database readiness probe failed.' })
  async getReady(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getLive();
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'The application database is not ready.',
      });
    }
  }

  @Get('version')
  @ApiOkResponse({ description: 'Build identity used to bind deployment evidence to Git.' })
  getVersion(): HealthResponse {
    return this.getLive();
  }
}
