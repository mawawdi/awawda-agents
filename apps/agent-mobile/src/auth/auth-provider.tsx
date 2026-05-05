import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { loginAgent, logoutAgent, refreshTokens } from '../api/auth-client'
import { type AgentProfile, type LoginInput } from './contracts'
import { getAuthFailureMessage } from './errors'
import {
  clearSessionToken,
  persistSessionToken,
  persistTokensOnly,
  readAccessExpiresAt,
  readRefreshToken,
  readSessionProfile,
  readSessionToken,
} from '../session/session-storage'
import { registerRefreshCallback, unregisterRefreshCallback } from './token-refresher'

const PROACTIVE_REFRESH_BUFFER_SECONDS = 5 * 60 // refresh if access token expires within 5 minutes

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

  // Keep a mutable ref for the current token so the refresh callback always sees the latest value
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const existingToken = await readSessionToken()
        if (existingToken) {
          const existingProfile = await readSessionProfile()
          if (existingProfile) {
            // Proactive refresh: if access token is near expiry, silently refresh before activating
            const expiresAt = await readAccessExpiresAt()
            const nowSeconds = Date.now() / 1000
            const accessExpiresAt = expiresAt ? expiresAt / 1000 : null
            const shouldRefresh = accessExpiresAt !== null && accessExpiresAt - nowSeconds < PROACTIVE_REFRESH_BUFFER_SECONDS

            if (shouldRefresh) {
              const storedRefreshToken = await readRefreshToken()
              if (storedRefreshToken) {
                const refreshed = await refreshTokens(storedRefreshToken)
                if (refreshed) {
                  const newExpiresAt = Date.now() + refreshed.expiresIn * 1000
                  await persistTokensOnly(refreshed.accessToken, refreshed.refreshToken, newExpiresAt)
                  tokenRef.current = refreshed.accessToken
                  setState({ status: 'authenticated', token: refreshed.accessToken, profile: existingProfile, errorMessage: null })
                  return
                }
              }
              // Refresh failed — fall through to unauthenticated
              await clearSessionToken()
            } else {
              tokenRef.current = existingToken
              setState({ status: 'authenticated', token: existingToken, profile: existingProfile, errorMessage: null })
              return
            }
          } else {
            await clearSessionToken()
          }
        }
      } catch {
        await clearSessionToken()
      }

      setState({ status: 'unauthenticated', token: null, profile: null, errorMessage: null })
    }

    void bootstrap()
  }, [])

  // Register refresh callback whenever token state changes
  useEffect(() => {
    const refreshCallback = async (): Promise<string | null> => {
      const storedRefreshToken = await readRefreshToken()
      if (!storedRefreshToken) {
        setState({ status: 'unauthenticated', token: null, profile: null, errorMessage: null })
        return null
      }
      const result = await refreshTokens(storedRefreshToken)
      if (!result) {
        await clearSessionToken()
        setState({ status: 'unauthenticated', token: null, profile: null, errorMessage: null })
        return null
      }
      const newExpiresAt = Date.now() + result.expiresIn * 1000
      await persistTokensOnly(result.accessToken, result.refreshToken, newExpiresAt)
      tokenRef.current = result.accessToken
      setState((current) => ({ ...current, token: result.accessToken }))
      return result.accessToken
    }

    registerRefreshCallback(refreshCallback)
    return () => unregisterRefreshCallback()
  }, [])

  const signIn = useCallback(async (input: LoginInput): Promise<boolean> => {
    setState((current) => ({ ...current, errorMessage: null }))

    try {
      const result = await loginAgent(input)
      const accessExpiresAt = Date.now() + result.expiresIn * 1000
      await persistSessionToken(result.accessToken, result.agentProfile, result.refreshToken, accessExpiresAt)
      tokenRef.current = result.accessToken
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
  }, [])

  const signOut = useCallback(async (): Promise<void> => {
    unregisterRefreshCallback()
    const storedRefreshToken = await readRefreshToken().catch(() => null)
    await clearSessionToken()
    tokenRef.current = null
    setState({ status: 'unauthenticated', token: null, profile: null, errorMessage: null })
    if (storedRefreshToken) {
      void logoutAgent(storedRefreshToken)
    }
  }, [])

  const clearError = useCallback((): void => {
    setState((current) => ({ ...current, errorMessage: null }))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn,
      signOut,
      clearError,
    }),
    [state, signIn, signOut, clearError],
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
