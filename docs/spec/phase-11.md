# Phase 11 — Upcoming events (fake calendar)

Since phase 2, home's events card (#01) has shown one state: **"No upcoming events / Sign up with
your work email."** Since phase 10, tapping it opens the work-email upsell (#04). This phase gives
the card a calendar to read, and gives each meeting a way to become a note:

- A **`Calendar` port** has one implementation, **`CalendarFake`**. It reads events from its own
  store table, `fake_calendar_events`, which only the E2E harness writes (§6.5). This is the same
  arrangement as `EmailFake` and `email_outbox`.
- **`GET /calendar/events`** lists the caller's upcoming meetings. Each one says whether the caller
  already has a live note for it.
- The **home card** lists up to three of those meetings in #85's visual language: the magenta bar,
  the bold title, and the clock with **`1:00 PM ‒ 2:00 PM`**.
- **Tapping a meeting starts a note linked to it.** The live recording card (#102) opens with the
  meeting's title and its attendees already on it. The finished note keeps both, because generation
  only replaces "Untitled note" (phase 6). A meeting that already has a note opens that note
  instead.

**Discovery never saw a calendar.** It saw only the empty card (#01), the upsell behind it (#04),
and one event in the static lock-screen preview (#85: "Catch up with the team", `1:00 PM ‒ 2:00 PM`,
a magenta bar). So these states were never captured, and this spec designs each one in the
language of #01 and #85, marked *(designed)*:

- a populated card;
- a row for tomorrow's meeting and a row for one in progress;
- a row for a meeting that already has notes;
- the loading and error states;
- the live card started from a meeting;
- the "event gone" and "already has notes" outcomes.

**References and ids.** `#NN` is `~/personal/granola-clone-discovery/screens/NN-*/`. Tokens come from
the discovery README and `apps/native/src/design/tokens.ts`. Layout numbers are iOS points measured on
the 428pt discovery device. The clone runs at 402pt, so horizontal measurements are insets from an
edge.

**Branding.** No string here names the product except the phase-10 preview's "Start Notes", which
does not change. Discovery's calendar glyph, the spiral and the lock-screen chrome are not copied;
the glyphs are lucide.

**Real calendars are out of scope.** Google OAuth is a later, key-dependent phase (phases.md). This
phase adds the port that phase will implement, and records the missing client as a blocker (§10).

---

## 1. Scope

| In | Out (and where it goes) |
| --- | --- |
| The `Calendar` port, `CalendarFake` and its store `fake_calendar_events`, and `CALENDAR_MODE` (`fake`; `live` refused until a client exists) | A live Google / Microsoft client and OAuth (phases.md, Out of scope; §10 blocker) |
| `GET /calendar/events?until=`: the caller's meetings that have not ended and start before `until`, each with `noteId` when the caller has a live note for it | Calendar sync, webhooks and push. The fake is read on every request, so there is nothing to sync |
| The home events card in four states: loading *(designed)*, error *(designed)*, empty (#01, unchanged) and populated *(designed)* | Lock-screen notifications for upcoming meetings. The phase-10 toggle is stored and still controls nothing (§10) |
| Tapping a meeting starts a recording linked to it: `POST /recordings { calendarEventId }` creates the note with the meeting's title and attendees | A "prepare notes before the meeting" note with no recording. In this app a new note is always a recording (phase 5) |
| A meeting that already has a live note opens that note. Trashing the note unlinks the meeting | Linking an existing note to a meeting by hand, or unlinking one without trashing it |
| The harness routes `POST /e2e/calendar` and `POST /e2e/calendar/mode`, and the reset clearing both | A calendar settings page, or a choice of which calendars to show |
| The populated card is hidden in a folder view, as the empty one is (phase 9 §3.2) | A full "all upcoming events" screen. The card shows three, then "+N more" (§3.1) |

---

## 2. Journey

```
Home (#01)
  └ events card
      ├ loading  (home-events-loading)        spinner, not pressable                 (designed)
      ├ error    (home-events-error)          tap ──▶ refetch                         (designed)
      ├ empty    (home-events-card)           tap ──▶ Work-email sheet (#04, phase 10)
      └ populated (home-events-list)                                                 (designed)
          ├ meeting without notes ──tap──▶ mic check (phase 5 §3.11)
          │                                  ├ granted ──▶ live card (#102) with the meeting's
          │                                  │              title and attendees ──End──▶ note page
          │                                  ├ undetermined ──▶ primer (#100) ──Allow──▶ live card
          │                                  └ denied ──▶ denied card
          │                                 server says 404 ──▶ failed card, "This event is no
          │                                                     longer on your calendar."  (designed)
          │                                 server says 409 ──▶ opens that note + toast      (designed)
          ├ meeting with notes ──tap──▶ Note page (push) — or the live card, if that note is
          │                             the one recording now
          └ "+N more" (static)
```

**Presentation.** Nothing new. The live card is phase 5's `/record/[id]` card sheet, and the note is
phase 4's push.

---

## 3. Screens and states

### 3.1 The events card — `features/calendar/UpcomingEventsCard.tsx`, placed by `features/home/HomeShell.tsx`

The card replaces the inline `Card` in `HomeShell`. It keeps that card's frame from #01:

- inset 16 from both edges (`spacing.lg`), `spacing.lg` below the title;
- fill `bg.list` `#1A1A1A`, a 1pt `border.hairline` `#333` border, radius 24;
- it sits in the `#262626` header band, with the band's 40pt bottom padding below it.

It is **not rendered at all in a folder view**. A calendar is not about a folder, so this rule from
phase 9 §3.2 now covers all four states.

The data is `useUpcomingEvents()` (§3.3). The card picks exactly one state:

#### Loading *(designed)* — `home-events-loading`

It shows while the first fetch is pending and there is no cached data:

- the same 81pt layout as #01: a 44pt `IconTile` (`CalendarDays`, background `bg.app`), then a
  12pt gap and a column holding:
  - **"Upcoming events"** in `rowTitle` 17/22 semibold `text.primary`;
  - a small `ActivityIndicator` in `text.secondary`, left-aligned, 4pt below.
- It is **not pressable**. Its a11y label is **"Loading upcoming events"**.

A refetch over cached data never shows this state: the cached rows stay put.

#### Error *(designed)* — `home-events-error`

It shows when the fetch failed and there is no cached data:

- the #01 layout, with the `IconTile` glyph `CalendarX2`;
- **"Couldn’t load your calendar."** in `rowTitle`;
- **"Tap to try again."** in `secondary` 17/22 `text.secondary`.
- The whole card is a button with `PRESSED_OPACITY`. Its a11y label is **"Couldn’t load your
  calendar. Tap to try again."**
- A tap refetches. While that refetch runs, the card shows the loading state.

A failed *refetch* over cached rows keeps the rows and shows nothing. The next focus or the
minute's interval tries again.

#### Empty (#01, unchanged) — `home-events-card`

This shows when the fetch succeeded with no items. It is exactly phase 10's card:

- the `CalendarDays` tile;
- **"No upcoming events"**;
- "**Sign up** with your work email." with "Sign up" underlined;
- the a11y label "No upcoming events, Sign up with your work email.";
- a tap presents `/work-email` (#04).

**The id `home-events-card` now belongs to this state only.** Earlier phases' flows use it to mean
"the empty card", and it stays that way.

#### Populated *(designed)* — `home-events-list`

This shows when there is at least one item. The card holds no title and no upsell: once there are
meetings, the upsell does not apply. From top to bottom:

- **Up to three rows** (`UPCOMING_CARD_ROWS = 3`), in the server's order (§6.3). Each row is
  `home-event-<eventId>`, measured from #85's preview card:
  - The row is 72pt tall, with padding 16 at both sides and 14 at top and bottom. It is a
    `Pressable` with `PRESSED_OPACITY`.
  - At leading 16 is the **bar**: 4pt wide, 44pt tall, radius 2, in the event's `color`. The fake
    always sends `calendar.bar` `#DB35F2`, the token from #85. A colour that is not `#RRGGBB` falls
    back to `calendar.bar`.
  - 12pt right of the bar is a flexible column:
    - the **title** in `rowTitle` 17/22 semibold `text.primary`, one line, tail-truncated. A null
      title reads **"Untitled event"** *(designed)*;
    - 6pt below, the **time line**: a 15pt `Clock` glyph (stroke `ICON_STROKE`, `text.primary`),
      a 6pt gap, then the time text in `secondary` 15/20 `text.primary`. The text is white, as #85
      draws it.
  - Trailing, 12pt from the column, in this order and only when they apply:
    - the **Now badge** *(designed)*: a pill 24pt tall with 10pt horizontal padding, fill
      `olive.dark` `#424625`, and **"Now"** in `caption` 13/18 semibold `lime` `#B0BF40`. It shows
      when the meeting is in progress (`startAt ≤ now < endAt`);
    - the **notes mark** *(designed)*: the Notes mark (lucide `NotebookPen`, 18pt, `text.secondary`)
      then a 16pt `ChevronRight` in `text.secondary`. It shows when `noteId` is not null.
- Between rows is a 1pt `border.hairline` divider. It is inset 16 on both sides and aligned with
  the bar. There is no divider above the first row or below the last.
- **"+N more"** *(designed)*: `home-events-more`, shown only when the server returned more than
  three items. It is a 36pt line with its text at leading 32 (aligned with the titles), in
  `secondary` 15/20 `text.secondary`, and it has a divider above it like a row. N is
  `items.length - 3`. It is static: not pressable, a11y role `text`.

**The time text** comes from the pure `eventTimeLine(event, now)` in `features/calendar/eventTime.ts`,
which is unit-tested. Times are in the device's zone, formatted as `h:mm a` with the formatter home's
rows already use (`9:39 AM`):

| Case | Text |
| --- | --- |
| Starts today, or is in progress (whatever day it started) | `1:00 PM ‒ 2:00 PM` |
| Starts tomorrow | `Tomorrow, 1:00 PM ‒ 2:00 PM` *(designed prefix)* |
| Ends on a later day than it starts | the end time alone, as above. The end's day is not named |

The separator is **space, U+2012 FIGURE DASH, space**, as COPY.md has it. `until` ends the window
at the end of tomorrow (§3.3), so no other day can appear.

**Each row's a11y label** is its visible strings joined with ", ". Maestro reads a grouped row by
this label, as the phase-5 meta pill and the #01 card already are:

- `<title>, <time text>`, e.g. `Catch up with the team, Tomorrow, 1:00 PM ‒ 2:00 PM`;
- plus `, Now` when in progress;
- plus `, has notes` when `noteId` is not null.

The role is `button`. When `noteId` is null, the hint is **"Starts recording notes for this
meeting"**; otherwise it is **"Opens your notes"**.

**A tap:**

- **`noteId` is null.** Call `recording.onPress({ event })` (§3.2). This is the FAB's own permission
  path, with the meeting attached.
- **`noteId` is set.** Call `HomeShell.openNote({ id: noteId })`. That is the same function a list
  row uses, so a note that is the live recording reopens the live card, not the note page.
- **A recording is already live.** A tap on any row does what the FAB does: it opens the live card.
  It does not start a second recording (phase 5's `liveSessionId()` guard).

### 3.2 Starting a note from a meeting — `features/recording/useNewRecording.ts`, `liveRecording.ts`, `app/record/[id].tsx`

- **`useNewRecording().onPress(options?)`** takes an optional `{ event: UpcomingEvent }`. It keeps
  the event in a ref across the primer, the system alert and the denied card, so Allow on the primer
  starts the *meeting's* recording with no second tap. Closing the primer or the denied card
  forgets it.
- **`startRecording({ event })`**:
  - It seeds the live state with `title: event.title ?? null` and `attendeeNames`: the owner's
    name, then each non-`isMe` attendee's `name ?? email`, deduped by email.
  - It sends `POST /recordings { startedAt, calendarEventId: event.id }`. Without an event the
    request is unchanged.
- **The live card (#102) with a meeting** *(designed)*:
  - **`recording-title`** shows the meeting's title in serif `display` 40/46, in **`text.primary`**
    rather than the placeholder grey. It is a real title, not a placeholder. A null title shows
    "Untitled note" in grey, as today.
  - **`recording-meta-pill`** shows `+<attendeeNames.length>` (for example `+3`) in place of `+1`.
    Its a11y label is `<pillDate>, <attendeeNames joined with ", ">`, for example
    `Today 1:05 PM, E2E Person, Priya Raman, Sam Okafor`. Without a meeting it stays
    `<pillDate>, <owner>`, as phase 5 has it.
  - Everything else (the bar, Cancel/End, the private notes, Minimize and More) is unchanged.
- **Once the server answers 201**, the card behaves exactly as phase 5's. End leads to the note page
  (`note-title` = the meeting's title, `note-meta-pill` = `Today h:mm AM, +3`), and generation
  leaves the title alone.
- **The server answers 404 `CalendarEventNotFound`** *(designed)*. The meeting left the calendar
  between the fetch and the tap. The live state goes to phase 5's `failed` phase. The recording
  bar's error state (`recording-error`) reads **"This event is no longer on your calendar."** in
  place of "Couldn’t start recording.". That text gains the testID `recording-error-message`, and
  its Close (`recording-error-close`) is unchanged. Closing it invalidates `calendar.all`, so the card refetches.
- **The server answers 409 `CalendarEventHasNote`** *(designed)*. Another device got there first.
  The recorder is stopped and disposed without uploading, the live state is cleared, the card
  closes, and the app pushes `/notes/<details.noteId>`. `toast-message` reads **"This meeting
  already has notes."**. `calendar.all` is invalidated.
- **Any other failure** is phase 5's error state, unchanged.

### 3.3 The query — `features/calendar/useUpcomingEvents.ts`

- **`until`** is `endOfTomorrow(now)`: local midnight at the end of tomorrow, as epoch ms. It is
  computed on the device, because only the device knows its time zone. It changes once a day, so
  the query key is stable within a day.
- **Query key** `keys.calendar.upcoming(until)`. The options are `retry: 1`,
  `refetchInterval: 60_000` while home is focused, and a refetch on every home focus (the existing
  `useFocusEffect`).
  - The interval is what drops an ended meeting and moves the Now badge within a minute.
  - The card re-renders on each tick using `now`, so the badge and "Tomorrow" follow the clock even
    when the data has not changed.
- **Invalidations** (in `packages/apiclient`, §6.4): starting a recording and trashing or restoring
  a note invalidate `calendar.all`. So a row picks up its notes mark after a recording starts, and
  drops it after the note is trashed.
- **Signed out:** the query is disabled, as every other home query is.

### 3.4 Unchanged, and checked

- The **note page** (phase 4) and the **attendees sheet** (#16, phase 8) need no change. A note
  created from a meeting has ordinary attendee rows: the owner (`E2E Person (me)`) first, then the
  meeting's attendees in the provider's order. Each opens its person page (phase 8).
- The **home list** shows the new note like any recording: phone tile, the meeting's title, and
  today's group.
- **Settings › Notifications** (#85) is unchanged. Its preview card stays static.

---

## 4. Copy

Every string comes from COPY.md except those marked *(designed)*. Curly apostrophes are used
throughout.

| Where | Copy |
| --- | --- |
| Empty card (#01) | No upcoming events · Sign up with your work email. ("Sign up" underlined) |
| Empty card a11y | No upcoming events, Sign up with your work email. |
| Loading card *(designed)* | Upcoming events · a11y "Loading upcoming events" |
| Error card *(designed)* | Couldn’t load your calendar. · Tap to try again. |
| Row time (#85) | 1:00 PM ‒ 2:00 PM (U+2012 with spaces) |
| Row time, tomorrow *(designed)* | Tomorrow, 1:00 PM ‒ 2:00 PM |
| Row badge *(designed)* | Now |
| Row, no title *(designed)* | Untitled event |
| Row a11y suffix *(designed)* | , Now · , has notes |
| Row a11y hints *(designed)* | Starts recording notes for this meeting · Opens your notes |
| More line *(designed)* | +1 more · +2 more (always "+N more") |
| Recording bar error, event gone *(designed)* | This event is no longer on your calendar. · Close |
| Event already has notes *(designed)* | This meeting already has notes. |
| Live card title (#102) | the meeting's title; "Untitled note" when it has none |

**The fake's demo schedule** (`preset: "demo"`, §6.5) uses neutral titles, none of them a real
company's: **"Catch up with the team"** (from #85), **"Design review"** and **"Weekly planning"**. Its
attendees are `Priya Raman <priya@example.com>` and `Sam Okafor <sam@example.com>`, the phase-4
seed's guests.

---

## 5. testIDs

| Screen | IDs |
| --- | --- |
| Events card | `home-events-loading`, `home-events-error`, `home-events-card` (empty only), `home-events-list`, `home-event-<eventId>`, `home-events-more` |
| Live card | `recording-screen`, `recording-title`, `recording-meta-pill`, `recording-end`, `recording-error`, `recording-error-close` (all phase 5's, unchanged), and the new `recording-error-message` on the error text |
| Existing, reused | `home-screen`, `home-title`, `home-note-<id>`, `note-screen`, `note-title`, `note-meta-pill`, `note-status`, `note-back`, `attendees-sheet`, `attendees-row-<id>`, `attendees-close`, `work-email-sheet`, `toast-message`, `home-folders-button` |

---

## 6. API

### 6.1 Routes

All routes are session-authenticated, and every handler is one expression (R6).

| Route | Context / name | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /calendar/events` | `Calendar` — `listUpcomingEventsRoute` | query `UpcomingEventsQuery` `{ until }` (epoch ms) | 200 `UpcomingEventsPage` `{ items: UpcomingEvent[] }`: at most `UPCOMING_EVENTS_MAX` (20) meetings with `endAt > now` and `startAt < until`, in order (§6.3) | 401; 422 `ValidationFailed` (missing or non-integer `until`, `until ≤ now`, or `until > now + CALENDAR_WINDOW_MAX_MS`); 503 `CalendarUnavailable` |
| `POST /recordings` (changed) | `Recordings` — `createRecordingRoute` | body `RecordingCreate` gains `calendarEventId?: CalendarEventId` | 201 `RecordingCreated` as before. With an event, the note's title and attendees come from it (§6.3) | as before, plus 404 `CalendarEventNotFound`; 409 `CalendarEventHasNote` with `details.noteId`; 503 `CalendarUnavailable` |
| `POST /e2e/calendar` | E2E harness, behind the secret, not in OpenAPI | `{ role, events: StagedEvent[] }` or `{ role, preset: "demo" }` | 200 `{ items: { id, title }[] }`. It **replaces** that role's staged events | 401 without the secret; 422 |
| `POST /e2e/calendar/mode` | E2E harness | `{ mode: "auto" \| "fail" }` | 200 `{ mode }` | 401; 422 |

`POST /e2e/reset` also truncates `fake_calendar_events` (through `RESET_ORDER`) and the `calendar`
switch.

### 6.2 Shapes

```ts
// packages/domain/src/Domain/Calendar.ts
// A provider's id, opaque: a Google event id is not ours to prefix. Bounded and URL-safe, so it can
// be a testID and a unique-index key.
export const CalendarEventId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).brand<"CalendarEventId">();
export const CALENDAR_WINDOW_MAX_MS = 14 * 24 * 60 * 60 * 1000;
export const UPCOMING_EVENTS_MAX = 20;
export const DEFAULT_CALENDAR_COLOR = "#DB35F2"; // #85's bar
export const CalendarColor = z.string().regex(/^#[0-9A-F]{6}$/);

export const EventAttendee = z.object({
  email: z.string().nullable(),
  isMe: z.boolean(), // the caller's own address, compared lower-cased
  name: z.string().nullable(),
});

export const UpcomingEvent = z.object({
  attendees: z.array(EventAttendee),
  color: CalendarColor,
  endAt: Timestamp,
  id: CalendarEventId,
  noteId: NoteId.nullable(), // the caller's live (untrashed) note started from this event
  startAt: Timestamp,
  title: z.string().min(1).max(500).nullable(), // null when the provider's title is blank
});

export const UpcomingEventsQuery = z.object({ until: z.coerce.number().int() });
export const UpcomingEventsPage = z.object({ items: z.array(UpcomingEvent) });

// packages/domain/src/Domain/Recording.ts (changed)
export const RecordingCreate = z.strictObject({
  calendarEventId: CalendarEventId.optional(),
  startedAt: Timestamp.optional(),
});

// packages/domain/src/Calendar/Errors.ts
export class CalendarUnavailable extends appError("CalendarUnavailable", 503) {}
export class CalendarEventNotFound extends appError("CalendarEventNotFound", 404) {}   // details { calendarEventId }
export class CalendarEventHasNote extends appError("CalendarEventHasNote", 409) {}     // details { calendarEventId, noteId }
```

**The port** (`packages/server/src/Integrations/Calendar/Port.ts`). It is shaped by what the
services need and carries no vendor types:

```ts
export type CalendarEventRecord = {
  readonly attendees: readonly { readonly email: string | null; readonly name: string | null }[];
  readonly color: string | null;
  readonly endAt: Timestamp;
  readonly id: string;
  readonly startAt: Timestamp;
  readonly title: string | null;
};
export type CalendarMode = "auto" | "fail";
export type CalendarPort = {
  // Events overlapping [from, until) on this user's calendar. The service re-filters, so a
  // provider that returns a little extra cannot leak it.
  listEvents: (q: { readonly userId: UserId; readonly from: Timestamp; readonly until: Timestamp })
    => Promise<readonly CalendarEventRecord[]>;
  getEvent: (q: { readonly userId: UserId; readonly eventId: CalendarEventId })
    => Promise<CalendarEventRecord | null>;
};
```

**`CalendarFake`** (`Integrations/Calendar/CalendarFake.ts`) follows PROVIDER-FAKES.md rules 4–6:

- It takes `{ store, readMode }`.
- `store` is `Pick<FakeCalendarRepo, "listOverlapping" | "byId">` over `fake_calendar_events`. A
  test hands it an array-backed store.
- `readMode` reads the `calendar` switch.
- It records every call in `calls`.
- `failWith("unavailable")`, or the switch reading `fail`, throws `CalendarUnavailable` *after*
  recording the call.
- It is deterministic: the output depends only on what is stored and on the query.

**`StagedEvent`** (harness only, `E2E/Fixtures.ts`), strict:

```ts
{ id?: CalendarEventId; title: string | null; startAt: Timestamp; endAt: Timestamp /* > startAt */;
  color?: string; attendees?: { name?: string; email?: string }[] /* ≤ 50 */ }
```

### 6.3 Storage and rules

**Tables.** Keys are alphabetical, times are epoch-ms, and both come from `db:generate` as
`d1-migrations/0010_calendar.sql`:

```
fake_calendar_events           the fake vendor's own store; nothing but the fake and the harness touch it
  attendees   attendees   text not null        JSON [{ name, email }], either may be null
  color       color       text
  createdAt   created_at  integer not null
  endAt       end_at      integer not null
  id          id          text not null
  startAt     start_at    integer not null
  title       title       text
  userId      user_id     text not null references user(id) on delete cascade
  primary key (user_id, id)
  index fake_calendar_events_user_start_idx (user_id, start_at)

notes (changed)
  calendarEventId  calendar_event_id  text            null for every note not started from a meeting
  unique index notes_owner_event_live_idx (owner_id, calendar_event_id)
    where calendar_event_id is not null and trashed_at is null
```

`RESET_ORDER` gains `fakeCalendarEvents` next to `emailOutbox`. It has no domain children.

**Listing** (`packages/server/src/Calendar/`: `CalendarRepo`, `Policy`, `CalendarService`, `Http`):

- `CalendarService.upcoming(actor, { until })` does the following:
  1. `canReadCalendar(actor)` → `Authorized<UserId>`.
  2. It checks the window against `clock.now()`. `until ≤ now`, or `until > now +
     CALENDAR_WINDOW_MAX_MS`, raises `ValidationFailed` with `{ until }`.
  3. It calls `calendar.listEvents({ userId, from: now, until })`. `CalendarUnavailable`
     propagates.
  4. It **re-filters** to `endAt > now && startAt < until && endAt > startAt`, then sorts by
     `(startAt, endAt, id)` ascending and takes the first `UPCOMING_EVENTS_MAX`.
  5. It maps each record:
     - a blank or whitespace title → `null`, and one over 500 characters is cut to 500;
     - a colour that fails `CalendarColor` (after upper-casing) → `DEFAULT_CALENDAR_COLOR`;
     - `isMe` = `email?.trim().toLowerCase() === actor.email.toLowerCase()`;
     - attendees with neither a name nor an email are dropped.
  6. It links notes with **`CalendarRepo.liveNoteIdsByEvent(ownerId, eventIds)`**, which reads the
     `notes` rows through `notes_owner_event_live_idx`. It returns a `Map<eventId, NoteId>` of live
     notes only. That is a read of the notes table, not an import of `NotesRepo`.
- Deps: `clock`, `calendar: CalendarPort` and `repo: CalendarRepo`.

**Starting from a meeting** (`RecordingsService.create`, changed). Deps gain `calendar: CalendarPort`.
With `calendarEventId`:

1. `calendar.getEvent({ userId: actor.id, eventId })` → `null` raises `CalendarEventNotFound`.
   `CalendarUnavailable` propagates. Nothing has been written yet.
2. `repo.liveNoteForEvent(actor.id, eventId)` → a note id raises `CalendarEventHasNote { noteId }`.
3. It builds the note:
   - `title`: the event's title trimmed and cut at a word to `NOTE_TITLE_MAX` (200). A blank title
     gives `DEFAULT_NOTE_TITLE`, so generation still names it.
   - `attendees`: the owner at position 0, as today. Then the event's attendees in order, skipping
     any whose email equals the owner's (case-insensitive), any with neither a name nor an email,
     and any whose `personKeyOf` duplicates an earlier one. The list is capped at 50, `NoteCreate`'s
     cap.
   - `calendarEventId`, and `source: "phone"`. `startedAt` is the body's or now, never the
     meeting's start: the list groups by when the recording happened.
4. The note, its attendees and the recording are written in the existing single batch
   (`stageCreate`, extended). If the unique index refuses the insert because a concurrent create
   won, the repo reports a conflict rather than throwing. The service then re-reads the winner and
   raises `CalendarEventHasNote` with its id, so a race answers 409, never 500.
5. Without `calendarEventId`, nothing changes and the port is not called.

**Why trashing unlinks.** The index and `liveNoteIdsByEvent` both ignore trashed notes. So once
the linked note is trashed, the meeting reads `noteId: null`, and a tap starts a fresh note.
Restoring the trashed note while a newer one is linked would break the unique index. So
`NotesService.restore` of a note whose event already has another live note **clears the restored
note's `calendar_event_id`** before untrashing it. It does this in one batch, and it is the only
write to that column after creation.

**Generation keeps the title.** `GenerationsRepo` writes a title only over `DEFAULT_NOTE_TITLE`
(phase 6), so a meeting's title survives. This spec adds a test for it (§7, test 17) and changes no
code.

**Config** (`Runtime/AppConfig.ts`): `CALENDAR_MODE: z.enum(["fake", "live"]).default("fake")`.

- `fake` is refused under `NODE_ENV=production` ("the fake invents every meeting").
- `live` is refused because there is no client yet, naming the blocker.
- `wrangler.jsonc` sets `CALENDAR_MODE` in **every** block: `"fake"` at the top level and in `dev`,
  and `"live"` in `production`. Production already fails at startup for the email and
  transcription blockers.
- `container.ts` builds `makeCalendarFake({ store: traced("FakeCalendarRepo", makeFakeCalendarRepo(db)), readMode })`,
  where `readMode` reads the `calendar` switch when the harness is armed and is `auto` otherwise.
  It wraps the fake in `traced("CalendarProvider", …)` (the service is `traced("Calendar", …)`, so a vendor call and a domain call differ by module) and hands it to `CalendarService` and
  `RecordingsService`.

### 6.4 Client (`packages/apiclient`)

- **`calendar.ts`**: `listUpcomingEvents` (`endpoint<typeof listUpcomingEventsRoute>`), exported
  from `index.ts`.
- **`query-keys.ts`**: `calendar: { all: ["calendar"], upcoming: (until) => ["calendar", "upcoming", until] }`.
- **Invalidation:** `createRecording`, `trashNote` and `restoreNote` add `calendar.all` to what
  they already invalidate.
- The typed error helpers learn `CalendarEventNotFound` and `CalendarEventHasNote`, so
  `liveRecording.ts` can branch on `error.code` and read `details.noteId`.

### 6.5 Seed

- **The base seed stages no events.** Every earlier flow meets the empty card (#01), exactly as
  before this phase.
- **`POST /e2e/calendar { role, events }`** replaces that role's rows. A missing `id` becomes
  `cev_e2e_<role>_<n>`, 1-based in array order, so a flow knows each row's testID. `createdAt` is
  `clock.now()`. The route validates `endAt > startAt`, at most 50 attendees, and at most 50 events.
- **`preset: "demo"`** is for someone driving the app by hand against local `wrangler dev`. It
  stages three events relative to the server clock, with `h` = the next whole UTC hour:
  - "Design review", from `h` to `h + 1h`, with Priya;
  - "Catch up with the team", from `h + 2h` to `h + 3h`, with Priya and Sam;
  - "Weekly planning", from `h + 24h` to `h + 24h 30m`, with no guests.

  It is deterministic for a given clock.
- **The Maestro script** `scripts/e2e-calendar.js` (`PRESET`) computes times in the simulator's
  zone (Maestro's JS engine shares it, as `today.js` relies on) and posts them:

`PRESET=standard`: `now` is the current minute, floored.

| id | Role | Title | Start → end | Attendees | Visible on person's card? |
| --- | --- | --- | --- | --- | --- |
| `cev_e2e_person_1` | person | Design review | now − 15m → now + 45m | Priya Raman | yes, row 1, **Now** |
| `cev_e2e_person_2` | person | Catch up with the team | tomorrow 13:00 → 14:00 | Priya Raman `priya@example.com`, Sam Okafor `sam@example.com`, E2E Person `e2e-person@gcnotes.test` | yes, row 2 |
| `cev_e2e_person_3` | person | Weekly planning | tomorrow 15:00 → 15:30 | none | yes, row 3 |
| `cev_e2e_person_4` | person | 1:1 with Dana | tomorrow 17:00 → 17:30 | Dana Lee | no: fourth, behind "+1 more" |
| `cev_e2e_person_5` | person | Morning sync | now − 3h → now − 2h | none | no: ended |
| `cev_e2e_person_6` | person | Quarterly review | the day after tomorrow 10:00 → 11:00 | none | no: beyond `until` |
| `cev_e2e_other_1` | other | Other’s meeting | tomorrow 09:00 → 10:00 | none | no: another user's |

The script sets `output.nowLine` to row 1's time text, e.g. `2:05 PM ‒ 3:05 PM`, formatted by hand
(`h:mm AM`). `PRESET=none` stages `[]` for both roles.

**New Maestro pieces:**

- `scripts/e2e-calendar.js` (`PRESET`) and `scripts/e2e-calendar-mode.js` (`MODE`). Both are
  modelled on `e2e-transcription.js`.
- `subflows/seed-calendar.yaml` (`PRESET`): runs the script, then `relaunch-app.yaml` (Keychain
  kept), and waits for `home-screen`. The relaunch is what makes home fetch the staged events,
  because `open-home.yaml` has already loaded it.
- `subflows/set-calendar-mode.yaml` (`MODE`).

---

## 7. API test cases

`Integrations/Calendar/Calendar.test.ts` (the fake over an array store):

1. **Overlap.** `listEvents` returns exactly the stored events overlapping `[from, until)` for that
   user, and none of another user's.
2. **Records and fails.** Each call is in `calls` with its arguments. After `failWith("unavailable")`
   the next call is recorded and then throws `CalendarUnavailable`. A switch reading `fail` does the
   same. `getEvent` for an unknown id returns `null`.

`Calendar/Calendar.test.ts` (`CalendarService` over `makeTestD1()`, `fixedClock(T)`, and the fake over
the real `FakeCalendarRepo`):

3. **Empty.** No staged rows gives `{ items: [] }`, and the fake was asked for
   `{ from: T, until }`.
4. **The window.** Of the events below, only in-progress, later-today and tomorrow are returned:
   - ended at `T` (`endAt === T`): excluded;
   - in progress: included;
   - later today: included;
   - tomorrow: included;
   - starting exactly at `until`: excluded;
   - `endAt ≤ startAt`: excluded.
5. **Order and cap.** 25 events come back sorted by `(startAt, endAt, id)`, with exactly 20 items.
6. **Mapping.**
   - A blank title gives `null`.
   - A 600-character title is cut to 500.
   - Colour `#db35f2` gives `#DB35F2`, and `magenta` gives `DEFAULT_CALENDAR_COLOR`.
   - An attendee with neither a name nor an email is dropped.
   - `E2E-Person@GCNotes.test` is `isMe: true`.
7. **Linked notes.** With a live note carrying `calendar_event_id = cev_1`, that event has that
   `noteId`. After trashing it, `null`. Another user's live note with the same event id does not
   link.
8. **Window validation.** `until = T` raises 422, `until = T + 14d + 1` raises 422, and
   `until = T + 14d` is accepted.
9. **Outage.** The fake failing gives `CalendarUnavailable` (503).

`Recordings/Recordings.test.ts` (extended):

10. **From a meeting.** Creating with `cev_e2e_person_2` gives:
    - `note.title` "Catch up with the team";
    - `note.attendees` names `[E2E Person (isMe), Priya Raman, Sam Okafor]`, with the owner's own
      event entry dropped;
    - the stored `calendar_event_id`;
    - `startedAt` = the body's value.

    The fake was asked `getEvent` once.
11. **Unknown event.** It raises 404 `CalendarEventNotFound` with `details.calendarEventId`. No
    note, attendee or recording row exists.
12. **Already has a note.** A second create for the same event raises 409 with
    `details.noteId` = the first note. After trashing that note, a create succeeds and links the
    new note.
13. **Race.** A conflicting live note inserted directly between the pre-check and the batch (a
    repo stub that skips the pre-check) gives 409 with the winner's id, not 500.
14. **Titles.** A blank title gives "Untitled note". A 250-character title is cut at a word to at
    most 200.
15. **Attendees.** Name-only and email-only attendees are kept. Duplicates by person key are kept
    once. 60 attendees are capped at 50 plus the owner.
16. **Unchanged path.** Creating without `calendarEventId` never calls the port. A calendar outage
    during a create *with* an event gives 503 and writes nothing.

`Generations/Generations.test.ts`:

17. **The meeting's title survives.** A note titled "Catch up with the team" keeps its title after
    a successful generation, and the body is written.

`Notes/Notes.test.ts`:

18. **Restore does not break the index.** Note A is linked to `cev_1`, then trashed. Note B is
    created from `cev_1`. Restoring A succeeds, A's `calendar_event_id` becomes null, and B stays
    linked.

`E2E/E2E.test.ts`:

19. **Staging replaces.** Staging for `person` replaces only `person`'s rows. Ids default to
    `cev_e2e_person_<n>`. `endAt ≤ startAt` gives 422. A reset empties the table and the switch.
    `preset: "demo"` stages the three events at the times §6.5 gives for `fixedClock`.

HTTP (`Calendar.http.test.ts`, `Recordings.http.test.ts`, `app.test.ts`):

20. **`GET /calendar/events`.**
    - Anonymous gives 401.
    - Without `until`, or with `until=abc`, it gives 422.
    - The 200 wire shape matches `UpcomingEventsPage`.
    - An outage gives 503 with `code: "CalendarUnavailable"`.
21. **`POST /recordings`.**
    - `{ calendarEventId: "bad id!" }` gives 422.
    - An unknown event gives 404 with `code: "CalendarEventNotFound"`.
    - A linked event gives 409 with `code: "CalendarEventHasNote"` and `details.noteId`.
    - `{ calendarEventId, extra: 1 }` gives 422 (strict).
22. **OpenAPI.** It lists `/calendar/events` under the `Calendar` tag, and the `/e2e/*` calendar
    routes are absent.

`Runtime/AppConfig.test.ts`:

23. **Config.** `CALENDAR_MODE` defaults to `fake`. `fake` with `NODE_ENV=production` is refused,
    naming the variable. `live` is refused, naming the blocker.

---

## 8. Acceptance criteria and flows

**Flow setup.**

- Every flow starts from `clearState`, `clearKeychain` and reset/seed, and signs in fast as
  `person` through `subflows/open-home.yaml`.
- The tags are `phase-11` and `regression`. `events-card.yaml` and `event-to-note.yaml` are also
  tagged `smoke`, because they are the phase's exit criteria.
- Flows select by `id`, and text is asserted only as a property of an id. There is no `sleep`.
- `config.yaml` gains `phase-11/*`.
- The microphone is already allowed on the simulator, as `start-recording.yaml` assumes.

| # | Given / When / Then | Flow |
| --- | --- | --- |
| AC1 — **exit: the card shows seeded events** | **Given** `person` on home and `seed-calendar.yaml` with `PRESET=standard`, **then** `home-events-list` is visible and `home-events-card` (the empty state) is not. The rows read, in this order (each `below` the previous): `home-event-cev_e2e_person_1` "Design review, ${output.nowLine}, Now"; `home-event-cev_e2e_person_2` "Catch up with the team, Tomorrow, 1:00 PM ‒ 2:00 PM"; `home-event-cev_e2e_person_3` "Weekly planning, Tomorrow, 3:00 PM ‒ 3:30 PM". `home-events-more` reads "+1 more". `home-event-cev_e2e_person_4`, `-5`, `-6` and `home-event-cev_e2e_other_1` are not visible. `home-note-not_e2e_launch` is still visible below the card. A screenshot is taken for the visual check against #85's row and #01's card. | `apps/native/.maestro/phase-11/events-card.yaml` |
| AC2 — **exit: event → note with its title and attendees** | **Given** AC1's seed, the transcriber on `hold` and the LLM on `auto`, **when** `person` taps `home-event-cev_e2e_person_2`, **then** `recording-screen` shows `recording-title` "Catch up with the team" and `recording-meta-pill` "Today \d{1,2}:\d{2} [AP]M, E2E Person, Priya Raman, Sam Okafor". **When** they wait for End (`wait-for-end.yaml`) and tap `recording-end`, **then** `note-screen` shows `note-title` "Catch up with the team" and `note-meta-pill` "Today \d{1,2}:\d{2} [AP]M, \+3". **When** they tap `note-meta-pill`, **then** `attendees-sheet` has rows (`attendees-row-.*`) reading "E2E Person (me)", "Priya Raman" and "Sam Okafor", in that order. **When** they close it and the transcription is released (`release-transcription.yaml`), **then** `note-status` goes and `note-title` still reads "Catch up with the team". **When** they go back home, **then** a `home-note-(?!not_e2e_).*` row reads "Catch up with the team, .*", and `home-event-cev_e2e_person_2` reads "Catch up with the team, Tomorrow, 1:00 PM ‒ 2:00 PM, has notes". **When** they tap it, **then** `note-screen` opens with `note-title` "Catch up with the team", and `recording-screen` is not visible. | `apps/native/.maestro/phase-11/event-to-note.yaml` |
| AC3 | **Given** `person` on home with no staged events, **then** `home-events-card` is visible with the label "No upcoming events, Sign up with your work email.", and `home-events-list` is not. **When** they tap it, **then** `work-email-sheet` is visible. | `apps/native/.maestro/phase-11/events-empty.yaml` |
| AC4 | **Given** AC1's staged events and the calendar mode `fail` (`set-calendar-mode.yaml`), **when** the app is relaunched, **then** `home-events-error` reads "Couldn’t load your calendar. Tap to try again." and neither `home-events-list` nor `home-events-card` is visible. **When** the mode is set back to `auto` and they tap `home-events-error`, **then** `home-events-list` appears with `home-event-cev_e2e_person_2`. | `apps/native/.maestro/phase-11/events-error.yaml` |
| AC5 | **Given** AC1's card on screen, **when** `e2e-calendar.js` with `PRESET=none` empties the calendar *without* a relaunch, and `person` taps `home-event-cev_e2e_person_3`, **then** `recording-error` is visible and `recording-error-message` reads "This event is no longer on your calendar.". **When** they tap `recording-error-close`, **then** `home-screen` is unobstructed, `home-events-card` (empty) is visible, and no `home-note-(?!not_e2e_).*` row exists (`assert-no-new-note.yaml`). | `apps/native/.maestro/phase-11/event-gone.yaml` |
| AC6 | **Given** AC1's card and person's folders (`seed-folders.yaml`), **when** `person` filters by Personal (`filter-by-folder.yaml`), **then** `home-title` reads "Personal" and neither `home-events-list` nor `home-events-card` is visible. **When** they go back to My notes, **then** `home-events-list` is visible again with `home-event-cev_e2e_person_1`. | `apps/native/.maestro/phase-11/events-folder.yaml` |

**Flows from earlier phases that this phase changes.** No flow's assertions change, because the base
seed stages no events. `home-events-card` now appears only after the first calendar fetch, so any
earlier flow that asserts or taps it straight after `open-home.yaml` gains a preceding
`extendedWaitUntil: visible: id: home-events-card, timeout: 10000`. These are:

- phase-2 `home-shell.yaml`;
- phase-4 `empty-list.yaml` and `notes-list.yaml`;
- phase-9 `folder-filter.yaml` and `folder-journey.yaml`;
- phase-10 `work-email.yaml`.

The full earlier suite must still pass (the phase loop's gate).

---

## 9. Designed states no flow reaches

- **409 `CalendarEventHasNote` on the device.** The client never sends a linked meeting: the row
  opens the note instead. Only a second device racing the first can reach it. It is covered by API
  tests 12–13, and the client branch by a unit test on `liveRecording.ts`'s error mapping. If the card
  was minimised before the 409 arrived, `useMeetingHandoff` (mounted at the root) clears the live
  state and opens the note as soon as the card is not on screen.
- **The loading card.** It shows for one local round trip. The flows wait past it, and
  `UpcomingEventsCard` renders it in the dev gallery (`app/dev/gallery.tsx` gains the four card
  states over fixture data) for the visual check.
- **A meeting that ends while home is open,** dropping within a minute. That needs a minute of
  waiting. It is covered by `eventTime.test.ts` and API test 4.
- **A row with a null title, a non-magenta colour, or both the Now badge and the notes mark.** These
  are shown in the dev gallery, not in a flow.
- **Starting from a meeting through the mic primer.** The simulator's microphone is already
  granted. The primer path is phase 5's, unchanged apart from carrying the event. Its rules live in
  `features/recording/newRecordingFlow.ts` (the hook `useNewRecording` only wires them to React), and
  `newRecordingFlow.test.ts` covers Allow starting the meeting's recording and Close forgetting it.

---

## 10. Blockers to record

Append these to `docs/plan/BLOCKERS.md`:

- **No live calendar client (phase 11).** Meetings come through the `Calendar` port, and the only
  implementation is `CalendarFake`, which reads `fake_calendar_events`. Only the E2E harness fills
  that table. `AppConfig` refuses `CALENDAR_MODE=fake` under `NODE_ENV=production` and refuses
  `live`, so production, which sets `live`, fails at startup for this reason too. Stubbed: local
  and the deployed dev Worker run the fake, and `POST /e2e/calendar` with `preset: "demo"` gives a
  hand-driven session something to show. Unblocked by the OAuth phase, which writes
  `Integrations/Calendar/CalendarClient.ts`, stores each user's connection and token, and adds its
  credential to `parseConfig`.
- **Upcoming-meeting notifications are not sent (phase 11).** The phase-10 toggle
  (`notifyUpcomingMeetings`) is stored and read by nothing. Push is out of scope. Unblocked by a
  phase that adds push and a cron (R8) over `CalendarService.upcoming`.
- **The work-email upsell never reflects a connection (phase 11).** The empty card still offers
  "Sign up with your work email." for every account with no meetings, because the fake has no
  notion of a connected calendar. Unblocked with the live client, when "no connection" and "no
  meetings" become different states.

---

## 11. Task split

### API (packages/domain, packages/server, packages/db, apps/api, packages/apiclient)

1. **`packages/domain`:**
   - `Domain/Calendar.ts` (§6.2), with `Domain/Calendar.test.ts` covering `CalendarEventId`,
     `CalendarColor` and `UpcomingEventsQuery`;
   - `Domain/Recording.ts`: `RecordingCreate.calendarEventId`;
   - `Calendar/Errors.ts` (`CalendarUnavailable` 503, `CalendarEventNotFound` 404,
     `CalendarEventHasNote` 409);
   - `Calendar/Contract.ts` (`listUpcomingEventsRoute`, tag `Calendar`);
   - `Recordings/Contract.ts`: document the new 404/409/503 on `createRecordingRoute`.
2. **`packages/db`:**
   - `schema/fake-calendar-events.ts`, exported from `schema/index.ts`;
   - `notes.calendarEventId` and the partial unique index `notes_owner_event_live_idx`;
   - `bun run db:generate` → `d1-migrations/0010_calendar.sql`;
   - `RESET_ORDER` gains `fakeCalendarEvents`.
3. **`packages/server/src/Integrations/Calendar/`:** `Port.ts`, `CalendarFake.ts`,
   `FakeCalendarRepo.ts` (`listOverlapping`, `byId`) and `Calendar.test.ts` (tests 1–2).
4. **`packages/server/src/Calendar/`:** `CalendarRepo.ts` (`liveNoteIdsByEvent`), `Policy.ts`
   (`canReadCalendar`), `CalendarService.ts` (`upcoming`), `Http.ts`, `Calendar.test.ts` (3–9) and
   `Calendar.http.test.ts` (20).
5. **`packages/server/src/Recordings/`:**
   - `RecordingsDeps.calendar`;
   - `create` with an event (§6.3);
   - `RecordingsRepo.liveNoteForEvent`, and `stageCreate` taking `calendarEventId` and extra
     attendees and reporting a unique conflict;
   - tests 10–16 and 21.
6. **`packages/server/src/Notes/`:** `restore` clearing a conflicting `calendar_event_id`
   (`NotesRepo`), and test 18. **`Generations/`:** test 17 only.
7. **`packages/server/src/E2E/`:**
   - `StagedEvent` in `Fixtures.ts`, and the demo preset;
   - `E2eRepo.stageCalendar(userId, rows)`, which replaces that user's rows;
   - the `calendar` switch and `calendarModeOf`;
   - `E2eService.stageCalendar` and `setCalendarMode`;
   - `POST /e2e/calendar` and `POST /e2e/calendar/mode` in `Http.ts`;
   - test 19.
8. **`Runtime/AppConfig.ts`:** `CALENDAR_MODE` with its two refusals, and test 23.
   **`container.ts`:** the fake, `CalendarService`, and `RecordingsService`'s new dep, all under
   `traced()` (§6.3).
9. **`apps/api`:**
   - mount the `Calendar` router and add the OpenAPI tag;
   - map the three new errors in `on-error.ts` (they carry their status, R7);
   - `wrangler.jsonc`: `CALENDAR_MODE` in every block;
   - `app.test.ts` (22);
   - `bun run deploy:check` must still resolve.
10. **`packages/apiclient`:**
    - `calendar.ts`;
    - `query-keys.ts`: `calendar.*`;
    - add `calendar.all` to the invalidations of `createRecording`, `trashNote` and `restoreNote`;
    - the error-code helpers for the two new codes;
    - key-shape tests.
11. **Docs:**
    - add the §7 scenario names to `docs/TESTING.md` §4;
    - add the §10 blockers to `docs/plan/BLOCKERS.md`;
    - add a `Calendar/` row to the "which mode runs where" table in `PROVIDER-FAKES.md`, which
      already names calendar.

### Native (apps/native)

1. **`features/calendar/`:**
   - `eventTime.ts`: `eventTimeLine`, `isInProgress`, `endOfTomorrow` and `eventA11yLabel`, with
     `eventTime.test.ts` covering today, tomorrow, in progress (including one started yesterday),
     past midnight, the U+2012 separator, and the label suffixes;
   - `copy.ts` (§4);
   - `useUpcomingEvents.ts` (§3.3);
   - `UpcomingEventsCard.tsx` (§3.1: four states, rows, divider, "+N more", taps).
2. **`features/home/HomeShell.tsx`:** replace the inline card with `UpcomingEventsCard`, still
   hidden in a folder view. Pass it `openNote` and `recording.onPress`. Keep `home-events-card` on
   the empty state only.
3. **`features/recording/`:**
   - `useNewRecording.onPress({ event })`, holding the event across the primer and the denied card;
   - `startRecording({ event })`, sending `calendarEventId` and seeding `title` and
     `attendeeNames` in the live state;
   - the 404 message (and the `recording-error-message` testID in `RecordingBar.tsx`) and the 409
     hand-off (§3.2), with a unit test on the error mapping;
   - `copy.ts` gains the two strings.
4. **`app/record/[id].tsx`:** the title in `text.primary` when the live state has one, and the
   pill's `+N` and a11y label from `attendeeNames`.
5. **`app/dev/gallery.tsx`:** the four card states and the row variants over fixture events (§9).
6. **`lib/api`:** re-export `listUpcomingEvents`, the `UpcomingEvent` type and `keys.calendar`.
7. **Maestro:**
   - `scripts/e2e-calendar.js`, `scripts/e2e-calendar-mode.js`;
   - `subflows/seed-calendar.yaml` and `subflows/set-calendar-mode.yaml`;
   - the six `phase-11/*.yaml` flows (§8), and `config.yaml` gaining `phase-11/*`;
   - the `extendedWaitUntil` lines added to the six earlier flows listed in §8.
