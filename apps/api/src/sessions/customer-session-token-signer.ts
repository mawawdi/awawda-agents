import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';

import { AUTH_CONFIG } from '../auth/auth.constants';
import type { AuthConfig } from '../auth/auth.types';
import type { CustomerSessionTokenSigner } from './sessions.types';

@Injectable()
export class JwtCustomerSessionTokenSigner implements CustomerSessionTokenSigner {
  constructor(@Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig) {}

  sign(payload: Record<string, unknown>, expiresInSeconds: number): string {
    return jwt.sign(payload, this.authConfig.jwtSecret, {
      algorithm: 'HS256',
      issuer: this.authConfig.jwtIssuer,
      expiresIn: expiresInSeconds,
    });
  }
}
