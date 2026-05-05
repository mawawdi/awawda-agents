import { describe, expect, it } from 'vitest';

import { Argon2PasswordVerifier } from './password-verifier';

describe('Argon2PasswordVerifier', () => {
  const verifier = new Argon2PasswordVerifier();

  it('returns true for matching password and hash', async () => {
    const argon2 = await import('argon2');
    const hash = await argon2.hash('correct-horse');
    expect(await verifier.verify('correct-horse', hash)).toBe(true);
  });

  it('returns false for non-matching password', async () => {
    const argon2 = await import('argon2');
    const hash = await argon2.hash('correct-horse');
    expect(await verifier.verify('wrong-password', hash)).toBe(false);
  });

  it('returns false when argon2.verify throws (corrupted hash string)', async () => {
    // argon2 throws a TypeError for malformed hash strings — verify() catches and returns false
    expect(await verifier.verify('any', 'not-a-valid-argon2-hash')).toBe(false);
  });
});
