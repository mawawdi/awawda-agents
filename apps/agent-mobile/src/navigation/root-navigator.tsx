import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { useAuth } from '../auth/auth-provider'
import { LoginScreen } from '../screens/login-screen'
import { AuthenticatedHomeScreen } from '../screens/authenticated-home-screen'
import { palette } from '../theme/tokens'

const Stack = createNativeStackNavigator()

export function RootNavigator(): React.JSX.Element {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: palette.background },
        headerTintColor: palette.primaryContainer,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      {status === 'authenticated' ? (
        <Stack.Screen
          name="AgentHome"
          component={AuthenticatedHomeScreen}
          options={{ title: 'Meatland Agent' }}
        />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
})
