import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';

import { AUTH_CONFIG } from './auth.constants';
import type { AuthConfig, ShiftTokenSigner } from './auth.types';

@Injectable()
export class JwtShiftTokenSigner implements ShiftTokenSigner {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  sign(payload: Record<string, unknown>, expiresInSeconds: number): string {
    return jwt.sign(payload, this.config.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: expiresInSeconds,
      issuer: this.config.jwtIssuer,
    });
  }
}
