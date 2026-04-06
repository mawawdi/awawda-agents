import { z } from 'zod'

export const LOGIN_INPUT_SCHEMA = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z
    .string()
    .trim()
    .min(8, 'Password must contain at least 8 characters.'),
})

export const AGENT_PROFILE_SCHEMA = z.object({
  agentId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
})

export const LOGIN_RESPONSE_SCHEMA = z.object({
  accessToken: z.string().trim().min(1),
  expiresIn: z.number().int().positive(),
  agentProfile: AGENT_PROFILE_SCHEMA,
})

export type LoginInput = z.infer<typeof LOGIN_INPUT_SCHEMA>
export type LoginResponse = z.infer<typeof LOGIN_RESPONSE_SCHEMA>
export type AgentProfile = z.infer<typeof AGENT_PROFILE_SCHEMA>
