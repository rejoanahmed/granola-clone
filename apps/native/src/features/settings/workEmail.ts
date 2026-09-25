import { SETTINGS_COPY } from "./copy";

export type PersonalProvider = "Gmail" | "Outlook" | "iCloud" | "Yahoo";

const PROVIDERS: Record<string, PersonalProvider> = {
  "gmail.com": "Gmail",
  "googlemail.com": "Gmail",
  "hotmail.com": "Outlook",
  "icloud.com": "iCloud",
  "live.com": "Outlook",
  "mac.com": "iCloud",
  "me.com": "iCloud",
  "outlook.com": "Outlook",
  "yahoo.com": "Yahoo",
};

export function personalEmailProvider(email: string): PersonalProvider | null {
  const at = email.lastIndexOf("@");
  if (at < 0) {
    return null;
  }
  return (
    PROVIDERS[
      email
        .slice(at + 1)
        .trim()
        .toLowerCase()
    ] ?? null
  );
}

// #04's body names the provider when it knows one; any other address gets the designed copy.
export function workEmailBody(email: string): string {
  const provider = personalEmailProvider(email);
  return provider
    ? SETTINGS_COPY.workEmail.personal(provider)
    : SETTINGS_COPY.workEmail.other;
}
