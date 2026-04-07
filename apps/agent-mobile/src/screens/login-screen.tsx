import React, { useMemo, useState } from 'react'
import { ActivityIndicator, I18nManager, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { useAuth } from '../auth/auth-provider'
import { validateLoginInput, type LoginValidationErrors } from '../auth/validation'
import { palette, radius, spacing, touchTarget } from '../theme/tokens'

export function LoginScreen(): React.JSX.Element {
  const { signIn, errorMessage, clearError } = useAuth()
  const [phoneOrEmail, setPhoneOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<LoginValidationErrors>({})

  const canSubmit = useMemo(() => !isSubmitting, [isSubmitting])

  const submit = async (): Promise<void> => {
    clearError()

    const errors = validateLoginInput({ phoneOrEmail, password })
    setFieldErrors(errors)

    if (Object.keys(errors).length > 0) {
      return
    }

    setIsSubmitting(true)
    await signIn({ phoneOrEmail, password })
    setIsSubmitting(false)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>הספר האומנותי</Text>
      <Text style={styles.subtitle}>כניסת סוכן להפעלת משמרת המכירות והלקוחות.</Text>

      <TextInput
        accessibilityLabel="Phone or email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="טלפון או אימייל ארגוני"
        value={phoneOrEmail}
        onChangeText={(value) => {
          setPhoneOrEmail(value)
          if (fieldErrors.phoneOrEmail) {
            setFieldErrors((current) => ({ ...current, phoneOrEmail: undefined }))
          }
        }}
        style={styles.input}
      />
      {fieldErrors.phoneOrEmail ? <Text style={styles.error}>{fieldErrors.phoneOrEmail}</Text> : null}

      <TextInput
        accessibilityLabel="Password"
        secureTextEntry
        placeholder="סיסמה"
        value={password}
        onChangeText={(value) => {
          setPassword(value)
          if (fieldErrors.password) {
            setFieldErrors((current) => ({ ...current, password: undefined }))
          }
        }}
        style={styles.input}
      />
      {fieldErrors.password ? <Text style={styles.error}>{fieldErrors.password}</Text> : null}

      {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void submit()
        }}
        style={({ pressed }) => [styles.button, (pressed || !canSubmit) && styles.buttonDisabled]}
        disabled={!canSubmit}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>כניסה למערכת</Text>}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    backgroundColor: palette.background,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: palette.primaryContainer,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  subtitle: {
    marginBottom: 6,
    color: palette.textMuted,
    fontSize: 14,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  input: {
    borderWidth: 0,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: palette.surfaceMid,
    color: palette.text,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    minHeight: touchTarget.comfortable,
  },
  button: {
    marginTop: 8,
    borderRadius: radius.md,
    backgroundColor: palette.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget.comfortable,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  error: {
    color: palette.danger,
    fontSize: 13,
  },
  errorBanner: {
    marginTop: 4,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.dangerSurface,
    color: palette.danger,
  },
})
