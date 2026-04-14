import React, { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { useFonts } from 'expo-font'
import { ActivityIndicator, Text, TextInput, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AuthProvider } from './src/auth/auth-provider'
import { RootNavigator } from './src/navigation/root-navigator'
import { palette } from './src/theme/tokens'

let hasAppliedGlobalFontDefaults = false

export default function App(): React.JSX.Element {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  })

  useEffect(() => {
    if (!fontsLoaded || hasAppliedGlobalFontDefaults) {
      return
    }

    const textComponent = Text as typeof Text & {
      defaultProps?: { style?: unknown; maxFontSizeMultiplier?: number }
    }
    const textInputComponent = TextInput as typeof TextInput & {
      defaultProps?: { style?: unknown; maxFontSizeMultiplier?: number }
    }

    textComponent.defaultProps = textComponent.defaultProps ?? {}
    textComponent.defaultProps.style = [{ fontFamily: 'PlusJakartaSans_400Regular' }, textComponent.defaultProps.style]
    textComponent.defaultProps.maxFontSizeMultiplier = 1.05

    textInputComponent.defaultProps = textInputComponent.defaultProps ?? {}
    textInputComponent.defaultProps.style = [
      { fontFamily: 'PlusJakartaSans_400Regular' },
      textInputComponent.defaultProps.style,
    ]
    textInputComponent.defaultProps.maxFontSizeMultiplier = 1.05
    hasAppliedGlobalFontDefaults = true
  }, [fontsLoaded])

  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background }}>
          <ActivityIndicator />
        </View>
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
