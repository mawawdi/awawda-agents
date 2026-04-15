import { MaterialIcons } from '@expo/vector-icons'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useAuth } from '../auth/auth-provider'
import { validateLoginInput, type LoginValidationErrors } from '../auth/validation'
import { palette, radius, spacing, touchTarget } from '../theme/tokens'

const IS_RTL_LAYOUT = true
const BASE_VIEWPORT_WIDTH = 430
const FONT_SCALE = Math.max(0.82, Math.min(1, Dimensions.get('window').width / BASE_VIEWPORT_WIDTH))

function scaledFont(baseSize: number): number {
  return Math.max(10, Math.round(baseSize * FONT_SCALE))
}

export function LoginScreen(): React.JSX.Element {
  const { signIn, errorMessage, clearError } = useAuth()
  const insets = useSafeAreaInsets()
  const [phoneOrEmail, setPhoneOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<LoginValidationErrors>({})

  const canSubmit = useMemo(() => !isSubmitting, [isSubmitting])
  const reveal = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(reveal, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [reveal])

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
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: spacing.xl + Math.max(insets.top, spacing.sm), paddingBottom: spacing.xl + Math.max(insets.bottom, spacing.sm) },
      ]}
      style={styles.container}
    >
      <Animated.View
        style={[
          styles.shell,
          {
            opacity: reveal,
            transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          },
        ]}
      >
        <View style={styles.topMeta}>
          <Text style={styles.salesApp}>אפליקציית סוכנים</Text>
          <Text style={styles.wordmark}>MEATLAND</Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <View style={styles.errorTextGroup}>
              <Text style={styles.errorTitle}>שגיאת התחברות</Text>
              <Text style={styles.errorBody}>{errorMessage}</Text>
            </View>
            <MaterialIcons color={palette.danger} name="error-outline" size={18} />
          </View>
        ) : null}

        <View style={styles.headerBlock}>
          <Text style={styles.title}>כניסת סוכנים</Text>
          <Text style={styles.subtitle}>הזן את הפרטים שלך כדי להתחיל יום עבודה</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>טלפון או דוא״ל</Text>
            <View style={styles.inputShell}>
              <TextInput
                accessibilityLabel="טלפון או דוא״ל"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="05x-xxxxxxx"
                placeholderTextColor="#9ca3af"
                style={styles.input}
                value={phoneOrEmail}
                onChangeText={(value) => {
                  setPhoneOrEmail(value)
                  if (fieldErrors.phoneOrEmail) {
                    setFieldErrors((current) => ({ ...current, phoneOrEmail: undefined }))
                  }
                }}
              />
              <MaterialIcons color="#9ca3af" name="alternate-email" size={18} style={styles.inputIcon} />
            </View>
            <View style={styles.verifiedRow}>
              <MaterialIcons color={palette.secondary} name="verified-user" size={13} />
              <Text style={styles.verifiedText}>מזוהה ע״י המערכת</Text>
            </View>
            {fieldErrors.phoneOrEmail ? <Text style={styles.errorInline}>{fieldErrors.phoneOrEmail}</Text> : null}
          </View>

          <View style={styles.fieldBlock}>
            <View style={styles.passwordHeader}>
              <Text style={styles.label}>סיסמה</Text>
              <Text style={styles.forgot}>שכחת סיסמה?</Text>
            </View>
            <View style={styles.inputShell}>
              <TextInput
                accessibilityLabel="סיסמה"
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                style={styles.input}
                value={password}
                onChangeText={(value) => {
                  setPassword(value)
                  if (fieldErrors.password) {
                    setFieldErrors((current) => ({ ...current, password: undefined }))
                  }
                }}
              />
              <MaterialIcons color="#9ca3af" name="visibility" size={18} style={styles.inputIcon} />
            </View>
            {fieldErrors.password ? <Text style={styles.errorInline}>{fieldErrors.password}</Text> : null}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          style={({ pressed }) => [styles.button, (pressed || !canSubmit) && styles.buttonDisabled]}
          onPress={() => {
            void submit()
          }}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>התחברות למערכת</Text>
              <MaterialIcons color="#fff" name="arrow-back" size={18} />
            </View>
          )}
        </Pressable>

        <View style={styles.helpRow}>
          <Text style={styles.helpText}>
            נתקלת בבעיה? <Text style={styles.helpLink}>צור קשר עם מנהל המחוז</Text>
          </Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerSide}>
              <Text style={styles.footerLabel}>עברית (ישראל)</Text>
            <View style={styles.footerDot} />
          </View>
          <View style={styles.footerSide}>
              <Text style={styles.footerLabel}>חיבור מאובטח v2.4</Text>
            <MaterialIcons color="#a8a29e" name="lock" size={12} />
          </View>
        </View>
      </Animated.View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafaf9',
  },
  scrollContent: {
    minHeight: '100%',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  shell: {
    borderRadius: 4,
    backgroundColor: '#fafaf9',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  topMeta: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    paddingHorizontal: 4,
  },
  salesApp: {
    color: '#0d9488',
    fontSize: scaledFont(11),
    fontWeight: '700',
    borderBottomWidth: 2,
    borderBottomColor: '#0d9488',
    paddingBottom: 2,
    letterSpacing: 0.5,
  },
  wordmark: {
    color: '#7f1d1d',
    fontSize: scaledFont(36),
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  errorBanner: {
    marginBottom: spacing.xl,
    backgroundColor: '#fef2f2',
    borderRightWidth: 3,
    borderRightColor: '#dc2626',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorTextGroup: {
    flex: 1,
    alignItems: IS_RTL_LAYOUT ? 'flex-end' : 'flex-start',
  },
  errorTitle: {
    color: '#7f1d1d',
    fontSize: 13,
    fontWeight: '700',
  },
  errorBody: {
    color: '#b91c1c',
    fontSize: 11,
    marginTop: 1,
  },
  headerBlock: {
    marginBottom: spacing.xl,
    alignItems: IS_RTL_LAYOUT ? 'flex-end' : 'flex-start',
  },
  title: {
    color: '#1c1917',
    fontSize: scaledFont(36),
    fontWeight: '800',
    letterSpacing: -0.8,
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
  },
  subtitle: {
    marginTop: 4,
    color: '#78716c',
    fontSize: scaledFont(14),
    fontWeight: '500',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
  },
  form: {
    gap: spacing.lg,
  },
  fieldBlock: {
    gap: 6,
  },
  label: {
    color: '#57534e',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
  },
  inputShell: {
    borderWidth: 2,
    borderColor: '#e7e5e4',
    borderRadius: 999,
    minHeight: 54,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    position: 'relative',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 1px 4px rgba(15, 23, 42, 0.06)' }
      : {
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        }),
  },
  input: {
    minHeight: 54,
    paddingHorizontal: 16,
    paddingLeft: 44,
    color: '#1c1917',
    fontSize: scaledFont(14),
    fontWeight: '500',
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  inputIcon: {
    position: 'absolute',
    right: IS_RTL_LAYOUT ? 14 : undefined,
    left: IS_RTL_LAYOUT ? undefined : 14,
    top: 17,
  },
  verifiedRow: {
    marginTop: 2,
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedText: {
    color: palette.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  passwordHeader: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgot: {
    color: '#a8a29e',
    fontSize: 12,
    fontWeight: '700',
  },
  button: {
    marginTop: spacing.xl,
    minHeight: touchTarget.comfortable + 8,
    borderRadius: radius.lg,
    backgroundColor: '#7f1d1d',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 12px 20px rgba(127, 29, 29, 0.20)' }
      : {
          shadowColor: '#7f1d1d',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.2,
          shadowRadius: 20,
          elevation: 6,
        }),
  },
  buttonDisabled: {
    opacity: 0.62,
  },
  buttonContent: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  buttonText: {
    color: '#fff',
    fontSize: scaledFont(18),
    fontWeight: '800',
  },
  helpRow: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  helpText: {
    color: '#a8a29e',
    fontSize: 13,
  },
  helpLink: {
    color: '#0d9488',
    fontWeight: '800',
  },
  footer: {
    marginTop: spacing.xl * 2,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#e7e5e4',
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerSide: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerLabel: {
    color: '#a8a29e',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footerDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#22c55e',
  },
  errorInline: {
    marginTop: 2,
    color: palette.danger,
    fontSize: 12,
    fontWeight: '600',
  },
})
