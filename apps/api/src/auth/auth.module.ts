import { Module } from '@nestjs/common';
import { getEnv } from '../config/env.js';
import { AUTH_CONFIG, type AuthConfig } from './auth.config.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwksTokenVerifier } from './jwks-token-verifier.js';

@Module({
  providers: [
    {
      provide: AUTH_CONFIG,
      useFactory: (): AuthConfig => {
        const env = getEnv();
        return {
          issuer: env.SUPABASE_JWT_ISSUER,
          audience: env.SUPABASE_JWT_AUDIENCE,
          allowInsecureLoopbackIssuer: env.NODE_ENV !== 'production',
        };
      },
    },
    JwksTokenVerifier,
    JwtAuthGuard,
  ],
  exports: [JwksTokenVerifier, JwtAuthGuard],
})
export class AuthModule {}
