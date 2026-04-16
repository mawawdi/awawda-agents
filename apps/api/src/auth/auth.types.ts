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
}
