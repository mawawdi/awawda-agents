import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { useFonts } from 'expo-font'
import { ActivityIndicator, Platform, Text, TextInput, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AuthProvider } from './src/auth/auth-provider'
import { RootNavigator } from './src/navigation/root-navigator'
import { palette } from './src/theme/tokens'

let hasAppliedGlobalFontDefaults = false

function applyGlobalFontDefaults(): void {
  if (hasAppliedGlobalFontDefaults) {
    return
  }

  const defaultFontFamily = Platform.select({
    // Plus Jakarta Sans does not ship Hebrew glyphs, so keep Hebrew-capable fallback fonts in web stack.
    web: '"Plus Jakarta Sans", "Noto Sans Hebrew", "Heebo", sans-serif',
    default: 'PlusJakartaSans_400Regular',
  })

  const textComponent = Text as typeof Text & {
    defaultProps?: { style?: unknown; maxFontSizeMultiplier?: number }
  }
  const textInputComponent = TextInput as typeof TextInput & {
    defaultProps?: { style?: unknown; maxFontSizeMultiplier?: number }
  }

  textComponent.defaultProps = textComponent.defaultProps ?? {}
  textComponent.defaultProps.style = [{ fontFamily: defaultFontFamily }, textComponent.defaultProps.style]
  textComponent.defaultProps.maxFontSizeMultiplier = 1.05

  textInputComponent.defaultProps = textInputComponent.defaultProps ?? {}
  textInputComponent.defaultProps.style = [{ fontFamily: defaultFontFamily }, textInputComponent.defaultProps.style]
  textInputComponent.defaultProps.maxFontSizeMultiplier = 1.05

  hasAppliedGlobalFontDefaults = true
}

applyGlobalFontDefaults()

export default function App(): React.JSX.Element {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  })

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
