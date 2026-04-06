import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { JwtShiftTokenSigner } from './shift-token-signer';

describe('JwtShiftTokenSigner', () => {
  it('signs tokens with configured issuer and ttl', () => {
    const signer = new JwtShiftTokenSigner({
      jwtSecret: 'test-secret',
      jwtIssuer: 'meatland-tests',
      shiftTokenTtlSeconds: 3600,
    });

    const token = signer.sign({ sub: 'agent-1', phone: '+972500000000', type: 'agent_shift' }, 120);

    const decoded = jwt.verify(token, 'test-secret', {
      issuer: 'meatland-tests',
    }) as jwt.JwtPayload;

    expect(decoded.sub).toBe('agent-1');
    expect(decoded.phone).toBe('+972500000000');
    expect(decoded.type).toBe('agent_shift');
    expect(decoded.exp! - decoded.iat!).toBe(120);

    const header = jwt.decode(token, { complete: true }) as { header: { alg: string } };
    expect(header.header.alg).toBe('HS256');
  });
});
