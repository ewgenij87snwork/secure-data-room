import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Principal } from '../auth/principal.decorator.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';
import { MeService } from './me.service.js';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Post('bootstrap')
  bootstrap(@Principal() principal: AuthenticatedPrincipal) {
    return this.meService.bootstrap(principal);
  }
}
