import { UserId } from "@gc/domain/Domain/Ids";
import type { UserType } from "@gc/domain/Domain/Profile";

// Fixed ids and addresses, never generated: reset-then-seed must produce the same world on every
// run, so a failing assertion names a bug rather than yesterday's data. Two people with notes, so a
// journey can prove that one of them cannot read the other's data, and a third with none, so a flow
// can see the empty list. The ids are branded, so a seeded person is an `Actor` as they stand.
export const E2E_USERS = {
  empty: {
    email: "e2e-empty@gcnotes.test",
    id: UserId.parse("usr_e2e_empty"),
    name: "E2E Empty",
  },
  other: {
    email: "e2e-other@gcnotes.test",
    id: UserId.parse("usr_e2e_other"),
    name: "E2E Other",
  },
  person: {
    email: "e2e-person@gcnotes.test",
    id: UserId.parse("usr_e2e_person"),
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
  empty: {},
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

export type E2eAttendee = {
  readonly email?: string;
  readonly id: string;
  readonly name?: string;
};

export type E2eNote = {
  readonly bodyMarkdown: string;
  readonly id: string;
  readonly ownerAttendeeId: string;
  readonly ownerRole: E2eRole;
  /** Besides the owner, who is always position 0. */
  readonly guests: readonly E2eAttendee[];
  readonly startedAt: number;
  readonly title: string;
  readonly trashedAt: number | null;
};

// Absolute instants, never "now minus a day": every run must draw the same list. Each is chosen so
// its local date is the same from UTC-8 to UTC+13 (docs/spec/phase-4.md §6.7).
const at = (month: number, day: number, hour: number): number =>
  Date.UTC(2026, month - 1, day, hour);

const LAUNCH_BODY = `### Launch checklist

- Confirmed the beta cohort: forty teams across three regions
- Pricing page copy still needs legal review
  - Annual discount wording is ambiguous
  - Remove the comparison table until the numbers are final
- Support macros drafted for the five most common questions

### Open risks

- Sync can lag on very large workspaces
  - Batch writes behind a queue before launch
  - Add a progress indicator for the first sync
- The onboarding email sequence has not been tested on mobile
- Two enterprise pilots are waiting on single sign-on

### Decisions

- Ship to the beta cohort on the 21st
- Keep the free tier at three seats
- Hold the press announcement until the second week

### Next Steps

- **Finish the pricing page review**

  Send the annual discount wording to legal by Wednesday and take the comparison table down.

- **Load-test sync on a large workspace**

  Run the queued batch writer against the largest beta workspace and record the p95 latency.

- **Test the onboarding emails on mobile**

  Check every email in the sequence in iOS Mail and Gmail before the cohort is invited.`;

const SOLO_BODY =
  "Not much to transcribe here. The recording captured only a brief greeting with no substantive discussion, decisions, or follow-ups.\n\n_Notes works best with real conversations, meetings, or notes to self. Try recording a call, a catch-up, or even a personal brain dump._";

// `person` sees launch and standup on Sat 12 Sep, then solo on Wed 5 Aug. The archived note is
// trashed and `other`'s note belongs to somebody else, so neither may ever appear on that list.
export const E2E_NOTES: readonly E2eNote[] = [
  {
    bodyMarkdown: LAUNCH_BODY,
    guests: [
      {
        email: "priya@example.com",
        id: "att_e2e_launch_1",
        name: "Priya Raman",
      },
      { email: "sam@example.com", id: "att_e2e_launch_2", name: "Sam Okafor" },
    ],
    id: "not_e2e_launch",
    ownerAttendeeId: "att_e2e_launch_0",
    ownerRole: "person",
    startedAt: at(9, 12, 10),
    title: "Launch planning review",
    trashedAt: null,
  },
  {
    bodyMarkdown:
      "### Updates\n\n- Pagination merged\n- Editor polish in review",
    guests: [],
    id: "not_e2e_standup",
    ownerAttendeeId: "att_e2e_standup_0",
    ownerRole: "person",
    startedAt: at(9, 12, 8),
    title: "Weekly standup",
    trashedAt: null,
  },
  {
    bodyMarkdown: SOLO_BODY,
    guests: [],
    id: "not_e2e_solo",
    ownerAttendeeId: "att_e2e_solo_0",
    ownerRole: "person",
    startedAt: at(8, 5, 9),
    title: "Solo reflection thoughts",
    trashedAt: null,
  },
  {
    bodyMarkdown: "Archived kickoff notes.",
    guests: [],
    id: "not_e2e_archived",
    ownerAttendeeId: "att_e2e_archived_0",
    ownerRole: "person",
    startedAt: at(9, 10, 9),
    title: "Archived kickoff",
    trashedAt: at(9, 11, 9),
  },
  {
    bodyMarkdown: "Nobody but other should ever read this.",
    guests: [],
    id: "not_e2e_other",
    ownerAttendeeId: "att_e2e_other_0",
    ownerRole: "other",
    startedAt: at(9, 12, 9),
    title: "Other person\u2019s private note",
    trashedAt: null,
  },
];
