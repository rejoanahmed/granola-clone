import { BRAND } from "@kn/domain/Brand";
import { BASE_PATH } from "@web/base-path";

// Every outbound address on the site, so a real store link is one edit.
export const SITE = {
  appStore: null as string | null, // TODO(Rex): the App Store link once the app is live
  name: BRAND.displayName,
  repo: "https://github.com/rejoanahmed/kothanote",
  selfHosting:
    "https://github.com/rejoanahmed/kothanote/blob/main/SELF-HOSTING.md",
  supportEmail: BRAND.supportEmail,
  // Absolute, for canonical and social-card URLs. Overridable so a preview build can point its
  // cards at itself.
  url: (import.meta.env.VITE_SITE_URL ?? BRAND.siteUrl).replace(/\/$/, ""),
} as const;

// A root-relative path under the site's base, for the plain `href`s and `src`s the router does not
// rewrite (public files, in-page anchors). Router `Link`s take the basepath on their own.
export const at = (path: `/${string}`): string => `${BASE_PATH}${path}`;
