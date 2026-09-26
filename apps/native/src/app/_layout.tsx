import { colors, ToastProvider } from "@native/design";
import { BootError } from "@native/features/auth/BootError";
import { connectLiveRecording } from "@native/features/recording/liveRecording";
import {
  connectUploads,
  resumeUploads,
} from "@native/features/recording/uploadQueue";
import { useMeetingHandoff } from "@native/features/recording/useMeetingHandoff";
import { TRANSCRIPT_DETENT } from "@native/features/transcript/sheet";
import useThemedNavigation from "@native/hooks/useThemedNavigation";
import { STALE_TIME_MS } from "@native/lib/api";
import {
  AuthProvider,
  useAuth,
  useProtectedRoute,
} from "@native/lib/auth-provider";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

// #16's header sits 251pt under the status bar (Add at y 298, 47pt safe area). At 0.7 the clone's sat
// 272pt under it, 21pt low (docs/parity/REPORT.md, P16-2); 0.73 puts it at ~248.
const ATTENDEES_DETENT = 0.73;
// #24, #26 and #28 all put the grabber a little over half-way down (y 942 of 2000).
const CHAT_SHEET_DETENT = 0.55;

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
const CHAT_SHEET = { ...SHEET, sheetAllowedDetents: [CHAT_SHEET_DETENT] };

// The recording store and the upload queue live outside React, so they are handed the one cache
// here; an upload left on disk by a previous launch resumes once somebody is signed in.
function RecordingRuntime() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const signedIn = session != null;
  useMeetingHandoff();
  useEffect(() => {
    connectLiveRecording(queryClient);
    connectUploads(queryClient);
  }, [queryClient]);
  useEffect(() => {
    if (signedIn) {
      resumeUploads().catch(() => undefined);
    }
  }, [signedIn]);
  return null;
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
        <Stack.Screen
          name="notes/[id]/attendees"
          // #16's grabber sits at y 270 of 926, so its sheet is ~0.7 of the screen, not iOS's half.
          options={{ ...SHEET, sheetAllowedDetents: [ATTENDEES_DETENT] }}
        />
        <Stack.Screen
          name="notes/[id]/rename"
          options={{ ...SHEET, sheetAllowedDetents: "fitToContents" }}
        />
        {/* Folders (docs/spec/phase-9.md §3.3, §3.4, §3.6). */}
        <Stack.Screen
          name="folders/new"
          options={{ ...SHEET, sheetAllowedDetents: "fitToContents" }}
        />
        <Stack.Screen
          name="folders/[id]/delete"
          options={{ ...SHEET, sheetAllowedDetents: "fitToContents" }}
        />
        <Stack.Screen
          name="notes/[id]/folder"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="notes/[id]/transcript"
          options={{ ...SHEET, sheetAllowedDetents: [TRANSCRIPT_DETENT] }}
        />
        <Stack.Screen
          name="record/[id]"
          // A full-height card over the dimmed home (screen 102). Swiping it down is a Minimize.
          options={{ ...SHEET, sheetAllowedDetents: [1] }}
        />
        <Stack.Screen name="ask/index" options={{ presentation: "modal" }} />
        {/* Pushes with no native header (docs/spec/phase-8.md §3.1, §3.2), like the note page. */}
        <Stack.Screen name="search" />
        <Stack.Screen name="people/[personKey]" />
        <Stack.Screen
          name="ask/history"
          // The large detent too, so the sheet can rise with the keyboard when Search is focused
          // and the rows stay above it.
          options={{
            ...SHEET,
            sheetAllowedDetents: [CHAT_SHEET_DETENT, 1],
          }}
        />
        <Stack.Screen name="ask/activity/[messageId]" options={CHAT_SHEET} />
        <Stack.Screen name="ask/citation/[noteId]" options={CHAT_SHEET} />
        {/* Settings, profile and upsells (docs/spec/phase-10.md §2). Settings pages are pushes. */}
        <Stack.Screen
          name="settings/delete-account"
          // The sheet's own fill, not transparent: the floating fit sheet ends a few points below
          // the content it measured, and a transparent container shows the system material there
          // as a lighter strip under the button.
          options={{
            ...SHEET,
            contentStyle: { backgroundColor: colors.bg.sheet },
            sheetAllowedDetents: "fitToContents",
          }}
        />
        <Stack.Screen
          name="settings/report-bug"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="settings/feedback"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="desktop"
          options={{
            ...SHEET,
            sheetAllowedDetents: [1],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="work-email"
          options={{
            contentStyle: { backgroundColor: "transparent" },
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="notes/[id]/edit"
          options={{ gestureEnabled: false, presentation: "fullScreenModal" }}
        />
      </Stack>
      <RecordingRuntime />
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
