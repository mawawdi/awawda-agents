import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { loginAgent } from '../api/auth-client'
import { type AgentProfile, type LoginInput } from './contracts'
import { getAuthFailureMessage } from './errors'
import { clearSessionToken, persistSessionToken, readSessionToken } from '../session/session-storage'

type AuthState = {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  token: string | null
  profile: AgentProfile | null
  errorMessage: string | null
}

type AuthContextValue = AuthState & {
  signIn: (input: LoginInput) => Promise<boolean>
  signOut: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    token: null,
    profile: null,
    errorMessage: null,
  })

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const existingToken = await readSessionToken()
        if (existingToken) {
          setState({ status: 'authenticated', token: existingToken, profile: null, errorMessage: null })
          return
        }
      } catch {
        await clearSessionToken()
      }

      setState({ status: 'unauthenticated', token: null, profile: null, errorMessage: null })
    }

    void bootstrap()
  }, [])

  const signIn = async (input: LoginInput): Promise<boolean> => {
    setState((current) => ({ ...current, errorMessage: null }))

    try {
      const result = await loginAgent(input)
      await persistSessionToken(result.accessToken)
      setState({
        status: 'authenticated',
        token: result.accessToken,
        profile: result.agentProfile,
        errorMessage: null,
      })
      return true
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'unauthenticated',
        token: null,
        profile: null,
        errorMessage: getAuthFailureMessage(error),
      }))
      return false
    }
  }

  const signOut = async (): Promise<void> => {
    await clearSessionToken()
    setState({ status: 'unauthenticated', token: null, profile: null, errorMessage: null })
  }

  const clearError = (): void => {
    setState((current) => ({ ...current, errorMessage: null }))
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn,
      signOut,
      clearError,
    }),
    [state],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
