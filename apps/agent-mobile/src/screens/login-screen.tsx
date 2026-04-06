import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { useAuth } from '../auth/auth-provider'
import { validateLoginInput, type LoginValidationErrors } from '../auth/validation'

export function LoginScreen(): React.JSX.Element {
  const { signIn, errorMessage, clearError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<LoginValidationErrors>({})

  const canSubmit = useMemo(() => !isSubmitting, [isSubmitting])

  const submit = async (): Promise<void> => {
    clearError()

    const errors = validateLoginInput({ email, password })
    setFieldErrors(errors)

    if (Object.keys(errors).length > 0) {
      return
    }

    setIsSubmitting(true)
    await signIn({ email, password })
    setIsSubmitting(false)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Agent Sign in</Text>
      <Text style={styles.subtitle}>Use your Meatland credentials to continue.</Text>

      <TextInput
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="name@meatland.example"
        value={email}
        onChangeText={(value) => {
          setEmail(value)
          if (fieldErrors.email) {
            setFieldErrors((current) => ({ ...current, email: undefined }))
          }
        }}
        style={styles.input}
      />
      {fieldErrors.email ? <Text style={styles.error}>{fieldErrors.email}</Text> : null}

      <TextInput
        accessibilityLabel="Password"
        secureTextEntry
        placeholder="••••••••"
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
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
    padding: 20,
    backgroundColor: '#f7f8fa',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginBottom: 12,
    color: '#4b5563',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  button: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: '#1d4ed8',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    color: '#b91c1c',
    fontSize: 13,
  },
  errorBanner: {
    marginTop: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
})
