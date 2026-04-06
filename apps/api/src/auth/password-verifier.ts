import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

import type { PasswordVerifier } from './auth.types';

@Injectable()
export class Argon2PasswordVerifier implements PasswordVerifier {
  async verify(plainText: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainText);
    } catch {
      return false;
    }
  }
}
