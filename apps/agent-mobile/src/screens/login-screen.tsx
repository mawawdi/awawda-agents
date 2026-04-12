import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Easing, I18nManager, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { useAuth } from '../auth/auth-provider'
import { validateLoginInput, type LoginValidationErrors } from '../auth/validation'
import { palette, radius, spacing, touchTarget } from '../theme/tokens'

export function LoginScreen(): React.JSX.Element {
  const { signIn, errorMessage, clearError } = useAuth()
  const [phoneOrEmail, setPhoneOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<LoginValidationErrors>({})
  const cardOpacity = useRef(new Animated.Value(0)).current
  const cardTranslateY = useRef(new Animated.Value(18)).current

  const canSubmit = useMemo(() => !isSubmitting, [isSubmitting])

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [cardOpacity, cardTranslateY])

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
      <Animated.View
        style={[
          styles.card,
          {
            opacity: cardOpacity,
            transform: [{ translateY: cardTranslateY }],
          },
        ]}
      >
        <Text style={styles.kicker}>The Artisanal Ledger</Text>
        <Text style={styles.title}>כניסת סוכן</Text>
        <Text style={styles.subtitle}>הפעילו משמרת מכירות עם נתוני לקוחות בזמן אמת.</Text>

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
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: palette.background,
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: spacing.xl,
    gap: spacing.lg,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 5,
  },
  kicker: {
    color: palette.primaryContainer,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: palette.primaryContainer,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: 14,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  input: {
    borderWidth: 1,
    borderColor: palette.outline,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: palette.surfaceLow,
    color: palette.text,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    minHeight: touchTarget.comfortable,
  },
  button: {
    marginTop: 8,
    borderRadius: radius.md,
    backgroundColor: palette.primaryContainer,
    borderWidth: 1,
    borderColor: '#0369a1',
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
    letterSpacing: 0.3,
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
