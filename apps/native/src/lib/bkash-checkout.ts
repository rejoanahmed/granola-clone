import { EXPO_AUTH_SCHEME } from "@native/lib/auth-client";
import { addEventListener } from "expo-linking";
import { dismissBrowser, openBrowserAsync } from "expo-web-browser";
import { Platform } from "react-native";

/**
 * How the attendee gets *back* from bKash, and nothing more: the payment outcome is decided
 * server-side at `GET /payments/bkash/callback`, and a deep link is a message anyone can send, so
 * arriving here is never evidence of payment — the caller re-reads the registration and believes
 * only that.
 */
export function bkashReturnUrl(registrationId: string): string {
  return `${EXPO_AUTH_SCHEME}://registrations/${registrationId}`;
}

export async function openBkashCheckout(
  bkashUrl: string,
  registrationId: string
): Promise<void> {
  const returnUrl = bkashReturnUrl(registrationId);

  const subscription = addEventListener("url", ({ url }) => {
    if (!url) {
      return;
    }
    // Prefix match too: a provider may append query parameters. Only iOS needs a manual dismiss.
    const isReturn = url === returnUrl || url.startsWith(`${returnUrl}?`);
    if (Platform.OS === "ios" && isReturn) {
      dismissBrowser().catch(() => {
        // Already dismissed; the caller refetches regardless.
      });
    }
  });

  try {
    // `openBrowserAsync` resolves on *any* close — deep link, Done, or a bKash timeout — which is
    // the caller's cue to refetch; `openAuthSessionAsync` would show iOS's sign-in consent sheet.
    await openBrowserAsync(bkashUrl);
  } finally {
    subscription.remove();
  }
}
