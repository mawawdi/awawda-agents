import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useAuth } from '../auth/auth-provider'

export function AuthenticatedHomeScreen(): React.JSX.Element {
  const { signOut, profile } = useAuth()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Authenticated Shell</Text>
      <Text style={styles.subtitle}>
        {profile ? `Signed in as ${profile.name}` : 'Signed in. Customer workflows plug in here next.'}
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void signOut()
        }}
        style={styles.logoutButton}
      >
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    gap: 16,
    backgroundColor: '#f9fafb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 16,
    color: '#4b5563',
  },
  logoutButton: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: '#111827',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#fff',
    fontWeight: '600',
  },
})
