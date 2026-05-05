import { z } from 'zod'

export const LOGIN_INPUT_SCHEMA = z.object({
  phoneOrEmail: z.string().trim().min(1, 'הזינו מספר טלפון או דוא״ל.'),
  password: z.string().trim().min(8, 'הסיסמה חייבת להכיל לפחות 8 תווים.'),
})

export const AGENT_PROFILE_SCHEMA = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().email().nullable(),
  role: z.enum(['field_agent', 'supervisor']),
})

export const LOGIN_RESPONSE_SCHEMA = z.object({
  accessToken: z.string().trim().min(1),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string().trim().min(1),
  refreshTokenExpiresIn: z.number().int().positive(),
  agentProfile: AGENT_PROFILE_SCHEMA,
})

export const REFRESH_RESPONSE_SCHEMA = z.object({
  accessToken: z.string().trim().min(1),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string().trim().min(1),
  refreshTokenExpiresIn: z.number().int().positive(),
})

export type RefreshResponse = z.infer<typeof REFRESH_RESPONSE_SCHEMA>

export type LoginInput = z.infer<typeof LOGIN_INPUT_SCHEMA>
export type LoginResponse = z.infer<typeof LOGIN_RESPONSE_SCHEMA>
export type AgentProfile = z.infer<typeof AGENT_PROFILE_SCHEMA>
