import { ToastProvider } from "@native/design";
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

const ATTENDEES_DETENT = 0.7;

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

// The phase-2 sheet presentation (docs/spec/phase-2.md): UIKit owns the detents and the dimming,
// `SheetChrome` draws the fill, the corners and the grabber.
const SHEET = {
  contentStyle: { backgroundColor: "transparent" },
  presentation: "formSheet",
  sheetCornerRadius: 40,
  sheetGrabberVisible: false,
} as const;

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
        <Stack.Screen
          name="notes/[id]/attendees"
          // #16's grabber sits at y 270 of 926, so its sheet is ~0.7 of the screen, not iOS's half.
          options={{ ...SHEET, sheetAllowedDetents: [ATTENDEES_DETENT] }}
        />
        <Stack.Screen
          name="notes/[id]/rename"
          options={{ ...SHEET, sheetAllowedDetents: "fitToContents" }}
        />
        <Stack.Screen
          name="notes/[id]/edit"
          options={{ gestureEnabled: false, presentation: "fullScreenModal" }}
        />
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
            <ToastProvider>
              <ThemedLayout />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
