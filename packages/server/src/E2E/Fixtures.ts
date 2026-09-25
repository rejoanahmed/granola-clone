import { CalendarEventId } from "@gc/domain/Domain/Calendar";
import { UserId } from "@gc/domain/Domain/Ids";
import type { UserType } from "@gc/domain/Domain/Profile";
import { Timestamp } from "@gc/domain/Domain/Time";
import { z } from "zod";

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

export type E2eSegment = {
  readonly endMs: number;
  readonly speaker: "A" | "B";
  readonly startMs: number;
  readonly text: string;
};

export type E2eRecording = {
  readonly durationMs: number;
  readonly id: string;
  readonly noteId: string;
  readonly segments: readonly E2eSegment[];
};

// Ten turns, A first and strictly alternating, so every turn is its own utterance and the sheet is
// long enough to scroll to its pinned header (phase-5.md §8 AC10).
const LAUNCH_TURNS = [
  "Let's start with the beta cohort. We confirmed forty teams across three regions.",
  "That's more than we planned for. Do the support macros cover the common questions?",
  "They cover the five we see most. The pricing page is the bigger worry.",
  "Legal still hasn't signed off on the annual discount wording, right?",
  "Right, and I'd take the comparison table down until the numbers are final.",
  "Agreed. What about sync on the very large workspaces?",
  "It can lag. The plan is to batch the writes behind a queue before launch.",
  "Then we need a progress indicator for the first sync, or people will think it's stuck.",
  "Good point. I'll add that, and load-test the queue against the largest beta workspace.",
  "Great. So we ship to the cohort on the 21st and hold the press until the second week.",
] as const;

const TURN_MS = 30_000;

const turns = (texts: readonly string[]): readonly E2eSegment[] =>
  texts.map((text, index) => ({
    endMs: (index + 1) * TURN_MS,
    speaker: index % 2 === 0 ? "A" : "B",
    startMs: index * TURN_MS,
    text,
  }));

// `standup` has no recording: its More menu has no View transcript, which a flow asserts. `other`'s
// is there for the ownership journeys.
export const E2E_RECORDINGS: readonly E2eRecording[] = [
  {
    durationMs: LAUNCH_TURNS.length * TURN_MS,
    id: "rec_e2e_launch",
    noteId: "not_e2e_launch",
    segments: turns(LAUNCH_TURNS),
  },
  {
    durationMs: 4000,
    id: "rec_e2e_solo",
    noteId: "not_e2e_solo",
    segments: [
      { endMs: 2000, speaker: "A", startMs: 0, text: "Hello. How are you?" },
    ],
  },
  {
    durationMs: 2 * TURN_MS,
    id: "rec_e2e_other",
    noteId: "not_e2e_other",
    segments: turns([
      "This is the other person's recording.",
      "Nobody else should be able to read it.",
    ]),
  },
];

export type E2eChatMessage = {
  readonly activity: readonly (
    | { readonly kind: "done" }
    | {
        readonly kind: "open" | "search";
        readonly notes: readonly { noteId: string; title: string }[];
      }
  )[];
  readonly citations: readonly {
    readonly index: number;
    readonly noteId: string;
    readonly startedAt: number;
    readonly title: string;
  }[];
  readonly content: string;
  readonly role: "assistant" | "user";
};

export type E2eChat = {
  readonly id: string;
  readonly messages: readonly E2eChatMessage[];
  readonly ownerRole: E2eRole;
  readonly scopeNoteId: string | null;
  readonly title: string;
  readonly updatedAt: number;
};

const LAUNCH_REF = {
  noteId: "not_e2e_launch",
  title: "Launch planning review",
};
const SOLO_REF = { noteId: "not_e2e_solo", title: "Solo reflection thoughts" };

const question = (content: string): E2eChatMessage => ({
  activity: [],
  citations: [],
  content,
  role: "user",
});

// Both of `person`'s threads fall in Older on any date after 19 Sep 2026, which is where the flows
// assert them (#24). `other`'s is there so a flow can prove it never lists. Every message is
// complete, and no chat preference is seeded, so `person`'s model is Auto.
export const E2E_CHATS: readonly E2eChat[] = [
  {
    id: "cht_e2e_cohort",
    messages: [
      question("How many teams are in the beta cohort?"),
      {
        activity: [
          { kind: "search", notes: [LAUNCH_REF] },
          { kind: "open", notes: [LAUNCH_REF] },
          { kind: "done" },
        ],
        citations: [{ index: 1, startedAt: at(9, 12, 10), ...LAUNCH_REF }],
        content: "The beta cohort is **forty teams** across three regions [1].",
        role: "assistant",
      },
    ],
    ownerRole: "person",
    scopeNoteId: null,
    title: "Beta cohort size",
    updatedAt: at(9, 12, 14),
  },
  {
    id: "cht_e2e_solo",
    messages: [
      question("What did I say?"),
      {
        activity: [{ kind: "open", notes: [SOLO_REF] }, { kind: "done" }],
        citations: [{ index: 1, startedAt: at(8, 5, 9), ...SOLO_REF }],
        content:
          "You only recorded a brief greeting, with no decisions or follow-ups [1].",
        role: "assistant",
      },
    ],
    ownerRole: "person",
    scopeNoteId: "not_e2e_solo",
    title: "Solo note recap",
    updatedAt: at(8, 5, 12),
  },
  {
    id: "cht_e2e_other",
    messages: [
      question("Secret question"),
      {
        activity: [],
        citations: [],
        content: "Nobody but other should read this.",
        role: "assistant",
      },
    ],
    ownerRole: "other",
    scopeNoteId: null,
    title: "Other person’s chat",
    updatedAt: at(9, 12, 9),
  },
];

export type E2eFolder = {
  readonly createdAt: number;
  readonly id: string;
  /** In the base seed, or only behind `POST /e2e/folders`. */
  readonly inBaseSeed: boolean;
  readonly name: string;
  /** Member notes, each added at the folder's `createdAt`. */
  readonly noteIds: readonly string[];
  readonly ownerRole: E2eRole;
};

// `person` has no folder until a flow asks for them, so the empty drawer and the empty Add to
// folder sheet are reachable as the ordinary signed-in user and no earlier flow ever sees one.
// `other`'s is in the base seed so ownership can be proven. Product holds the trashed archived note,
// which is what makes its live count 2 rather than 3 (docs/spec/phase-9.md §6.5).
export const E2E_FOLDERS: readonly E2eFolder[] = [
  {
    createdAt: at(9, 10, 9),
    id: "fld_e2e_other",
    inBaseSeed: true,
    name: "Other’s folder",
    noteIds: ["not_e2e_other"],
    ownerRole: "other",
  },
  {
    createdAt: at(9, 14, 9),
    id: "fld_e2e_personal",
    inBaseSeed: false,
    name: "Personal",
    noteIds: ["not_e2e_solo"],
    ownerRole: "person",
  },
  {
    createdAt: at(9, 14, 10),
    id: "fld_e2e_product",
    inBaseSeed: false,
    name: "Product",
    noteIds: ["not_e2e_launch", "not_e2e_standup", "not_e2e_archived"],
    ownerRole: "person",
  },
];

// ── The fake calendar (phase-11.md §6.5) ────────────────────────────────────────────────────────

const CALENDAR_STAGE_MAX = 50;
const STAGED_ATTENDEES_MAX = 50;

// What a flow may put on the fake's calendar: strict, so a field the fake does not store (a
// location, say) is a 422 rather than silently dropped and then missed on screen.
export const StagedEvent = z
  .strictObject({
    attendees: z
      .array(
        z.strictObject({
          email: z.string().min(1).max(320).optional(),
          name: z.string().min(1).max(200).optional(),
        })
      )
      .max(STAGED_ATTENDEES_MAX)
      .optional(),
    color: z.string().max(32).optional(),
    endAt: Timestamp,
    id: CalendarEventId.optional(),
    startAt: Timestamp,
    title: z.string().max(1000).nullable(),
  })
  .refine((event) => event.endAt > event.startAt, {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });
export type StagedEvent = z.infer<typeof StagedEvent>;

export const CalendarStageBody = z.union([
  z.strictObject({
    events: z.array(StagedEvent).max(CALENDAR_STAGE_MAX),
    role: z.string(),
  }),
  z.strictObject({ preset: z.literal("demo"), role: z.string() }),
]);

const HOUR_MS = 60 * 60 * 1000;
const PRIYA = { email: "priya@example.com", name: "Priya Raman" };
const SAM = { email: "sam@example.com", name: "Sam Okafor" };

// For someone driving the app by hand against `wrangler dev`: three meetings from the next whole
// UTC hour, so the card has something in progress soon, later today, and tomorrow. Neutral titles,
// and the phase-4 seed's guests.
export const demoCalendarFor = (now: number): StagedEvent[] => {
  const h = Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS;
  return [
    {
      attendees: [PRIYA],
      endAt: h + HOUR_MS,
      startAt: h,
      title: "Design review",
    },
    {
      attendees: [PRIYA, SAM],
      endAt: h + 3 * HOUR_MS,
      startAt: h + 2 * HOUR_MS,
      title: "Catch up with the team",
    },
    {
      attendees: [],
      endAt: h + 24 * HOUR_MS + HOUR_MS / 2,
      startAt: h + 24 * HOUR_MS,
      title: "Weekly planning",
    },
  ];
};
