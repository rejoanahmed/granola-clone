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

export type E2eRole = keyof typeof E2E_USERS;
export type E2eUser = (typeof E2E_USERS)[E2eRole];

export const isE2eRole = (value: string): value is E2eRole =>
  Object.hasOwn(E2E_USERS, value);
