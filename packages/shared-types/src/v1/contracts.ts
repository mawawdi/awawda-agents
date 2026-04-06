export interface AgentProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export interface AgentLoginRequest {
  phoneOrEmail: string;
  password: string;
}

export interface AgentLoginResponse {
  accessToken: string;
  expiresIn: number;
  agentProfile: AgentProfile;
}
