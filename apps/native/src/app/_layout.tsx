import { BootError } from "@native/features/auth/BootError";
import useThemedNavigation from "@native/hooks/useThemedNavigation";
import { STALE_TIME_MS } from "@native/lib/api";
import {
  AuthProvider,
  useAuth,
  useProtectedRoute,
} from "@native/lib/auth-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

/**
 * Built through `useState(factory)`: a module constant survives Fast Refresh wired to a dead tree,
 * and constructing in the render body makes a new cache every render. `retry: 1` because the API's
 * errors are typed and terminal, and retrying a payment POST is what the payment state machine
 * spends its life defending against.
 */
function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: 0 },
      queries: { retry: 1, staleTime: STALE_TIME_MS },
    },
  });
}

function ThemedLayout() {
  const { ThemedStatusBar, screenOptions } = useThemedNavigation();
  // Must be called under AuthProvider — it reads the session context.
  useProtectedRoute();
  const { me } = useAuth();

  return (
    <>
      <ThemedStatusBar />
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      </Stack>
      {me.status === "error" ? <BootError /> : null}
    </>
  );
}

// Order matters: `QueryClientProvider` must sit above `AuthProvider`, which holds the splash and so
// needs a tree that can already fetch.
export default function RootLayout() {
  const [queryClient] = useState(createAppQueryClient);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemedLayout />
          </AuthProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
