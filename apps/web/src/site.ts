import { BRAND } from "@kn/domain/Brand";

// Every outbound address on the site, so a real store link is one edit. The repository is addressed
// by its product name: rename the GitHub repository to `kothanote` (GitHub redirects
// the old address) before deploying a build with these links (docs/plan/RELEASE.md §2).
export const SITE = {
  appStore: null as string | null, // TODO(Rex): the App Store link once the app is live
  domain: BRAND.domain,
  name: BRAND.displayName,
  repo: "https://github.com/rejoanahmed/kothanote",
  selfHosting:
    "https://github.com/rejoanahmed/kothanote/blob/main/SELF-HOSTING.md",
  supportEmail: "TODO(Rex)@kothanote.app",
  url: (import.meta.env.VITE_SITE_URL ?? `https://${BRAND.domain}`).replace(
    /\/$/,
    ""
  ),
} as const;
