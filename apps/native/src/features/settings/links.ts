// Designed placeholders (docs/spec/phase-10.md §4, BLOCKERS.md): `notes.example` does not resolve,
// and this is the one object to change when real pages exist.
export const LINKS = {
  desktop: "https://notes.example/desktop",
  help: "https://notes.example/help",
  iphone: "https://notes.example/iphone",
  learnMore: "https://notes.example/data",
  privacy: "https://notes.example/privacy",
  // SELF-HOSTING.md, rendered: where a new user learns to deploy their own server (D019).
  selfHosting: "https://notes.example/self-hosting",
  // Where feedback goes when the user's server sends no mail: the phone's own mail app (D020).
  supportEmail: "support@notes.example",
} as const;
