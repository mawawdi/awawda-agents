export interface AuthAgentRecord {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: 'field_agent' | 'supervisor';
  passwordHash: string;
  isActive: boolean;
  updatedAt: Date;
}

export interface AuthAgentRepository {
  findByPhoneOrEmail(phoneOrEmail: string): Promise<AuthAgentRecord | null>;
  findById(agentId: string): Promise<AuthAgentRecord | null>;
}

export interface RefreshTokenRepository {
  createRefreshToken(agentId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  /** Atomically revoke an active token and return its agentId + createdAt. Returns null if not found/already revoked/expired. */
  rotateRefreshToken(
    tokenHash: string,
    newTokenHash: string,
    newExpiresAt: Date,
  ): Promise<{ agentId: string; tokenCreatedAt: Date } | null>;
  revokeRefreshToken(tokenHash: string): Promise<void>;
}

export interface PasswordVerifier {
  verify(plainText: string, hash: string): Promise<boolean>;
}

export interface ShiftTokenSigner {
  sign(payload: Record<string, unknown>, expiresInSeconds: number): string;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtIssuer: string;
  shiftTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}
