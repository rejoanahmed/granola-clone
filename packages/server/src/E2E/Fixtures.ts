import type { UserType } from "@gc/domain/Domain/Profile";

// Fixed ids and addresses, never generated: reset-then-seed must produce the same world on every
// run, so a failing assertion names a bug rather than yesterday's data. Two people, so a journey
// can prove that one of them cannot read the other's data.
export const E2E_USERS = {
  other: {
    email: "e2e-other@gcnotes.test",
    id: "usr_e2e_other",
    name: "E2E Other",
  },
  person: {
    email: "e2e-person@gcnotes.test",
    id: "usr_e2e_person",
    name: "E2E Person",
  },
} as const;

// A third address that is NEVER seeded and is forgotten by every reset, so the sign-up flow always
// meets an address with no account. Kept out of `E2E_USERS` because it has no fixed id: better-auth
// mints one on the first verified code, which is the behaviour under test.
export const E2E_NEWCOMER = { email: "e2e-newcomer@gcnotes.test" } as const;

// What a seeded person's profile holds. Both are onboarded, so a seeded sign-in goes straight home
// rather than through the first-run screens; `person` also carries work details for a flow to read.
export const E2E_PROFILES = {
  other: {},
  person: {
    companyName: "Notes E2E",
    jobTitle: "Engineer",
    userType: "startup_generalist",
  },
} as const satisfies Record<keyof typeof E2E_USERS, E2eProfileDetails>;

export type E2eProfileDetails = {
  readonly companyName?: string;
  readonly jobTitle?: string;
  readonly userType?: UserType;
};

export type E2eRole = keyof typeof E2E_USERS;
export type E2eUser = (typeof E2E_USERS)[E2eRole];

export const isE2eRole = (value: string): value is E2eRole =>
  Object.hasOwn(E2E_USERS, value);
