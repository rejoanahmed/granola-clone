import { BRAND } from "@kn/domain/Brand";

// The public pages the app links to, all under the product's page on rovierr.com (D035). The site
// has no desktop or iPhone download page yet, so both go to its front page; `selfHosting` is a
// stable address on the site that redirects to SELF-HOSTING.md, so the guide can move without an
// app release.
const SITE = BRAND.siteUrl;

export const LINKS = {
  desktop: `${SITE}/`,
  help: `${SITE}/#faq`,
  iphone: `${SITE}/`,
  learnMore: `${SITE}/#privacy`,
  privacy: `${SITE}/privacy`,
  // SELF-HOSTING.md, rendered: where a new user learns to deploy their own server (D019).
  selfHosting: `${SITE}/self-hosting`,
  // Where feedback goes when the user's server sends no mail: the phone's own mail app (D020).
  supportEmail: BRAND.supportEmail,
} as const;
