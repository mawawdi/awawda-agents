import { randomBytes } from 'crypto';

import { Injectable } from '@nestjs/common';

import type { MagicLinkTokenGenerator } from './links.types';

@Injectable()
export class CryptoMagicLinkTokenGenerator implements MagicLinkTokenGenerator {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }
}
