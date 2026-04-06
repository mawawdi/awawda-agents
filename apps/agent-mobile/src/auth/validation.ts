import { LOGIN_INPUT_SCHEMA, type LoginInput } from './contracts'

export type LoginValidationErrors = Partial<Record<keyof LoginInput, string>>

export function validateLoginInput(values: LoginInput): LoginValidationErrors {
  const parsed = LOGIN_INPUT_SCHEMA.safeParse(values)
  if (parsed.success) {
    return {}
  }

  const errors: LoginValidationErrors = {}

  for (const issue of parsed.error.issues) {
    const field = issue.path[0]
    if (typeof field === 'string' && !errors[field as keyof LoginInput]) {
      errors[field as keyof LoginInput] = issue.message
    }
  }

  return errors
}
