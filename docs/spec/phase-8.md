# Phase 8 — Search and people

**Search** is a pushed page, opened from home's magnifier (#60). It searches as you type, with no
submit. It answers in two sections: **People**, who are the attendees of the caller's live notes
matched on name or email, and **Previous meetings**, which are the caller's live notes matched on
title or body text (#61, #64). A query that matches nothing shows **No results / for “q”** (#63).
Clearing the field restores the empty state and hides the keyboard (#62). A person row opens the
**person page** (#65): an avatar, a serif name, the email and its domain, that person's meetings
grouped by day like home, and an **Ask anything** pill. The pill opens the person-scoped chat that
phase 7 built (#66).

**A person is not a row.** People are derived from `note_attendees` over the caller's own live
notes. `personKeyOf` (phase 7, `@kn/domain/Domain/Person`) is the only identity, so search, the
person page and person-scoped Ask always agree on who is the same person. Every query filters on
`notes.owner_id = caller and notes.trashed_at is null` in SQL. So another user's notes and
attendees, and trashed notes, can never reach a result, and neither can someone who attended only
a trashed note.

Discovery saw the empty, results, cleared, no-results and body-match states, plus one person page
and its composer. It never saw search loading, a search error, a person page loading or failing,
a person with no email, or a search with many results. This spec designs those in the same visual
language and marks each one *(designed)*.

Screens: `#NN` is `<discovery>/screens/NN-*/`. Tokens come from the discovery
README and `apps/native/src/design/tokens.ts`. Layout numbers are iOS points on the 428pt discovery
device. The app runs at 402pt, so horizontal measurements are relative to the 20pt phase-2
gutter. Discovery exposes `searchTextField`, `searchPersonRow`, `searchResultRow` and so on. The
app uses its own `search-*` and `person-*` ids (§5), in the `<screen>-<thing>` form every flow
selects by.

---

## 1. Scope

| In | Out (and where it goes) |
| --- | --- |
| The search page, pushed from `home-search-button` (#60), with its keyboard auto-open, bottom-docked field, clear button and keyboard toggle (#60–#62) | Match snippets and highlighting: discovery shows none (#61, #64) |
| Live results in **People** and **Previous meetings** (#61), each section hidden when it is empty (#64) | Transcript text: discovery's copy says "title, notes, or people", and #64 is a body match. Transcripts are not searched (§10) |
| Title and body matches, case-insensitive substring (#61, #64) | Ranking by relevance: meetings are newest first (§6.3) |
| No results (#63) | Paging search results: capped at 8 people and 50 meetings (§6.3, §10) |
| The person page (#65): header, meetings grouped by day, keyset-paginated like home | Real avatars: an initial on a raised tile (§3.3, §10) |
| The person page's **Ask anything** pill opening phase 7's person chat (#66) | Editing a person, merging two people, or linking an attendee to an account |
| Repointing phase 7's interim entry: an attendees-sheet row now opens the person page, not the chat (phase-7 §3.7) | Recent searches: never seen |
| API: `GET /search`, `GET /people/{personKey}`, and a `person` filter on `GET /notes` | |

---

## 2. Journey

```
Home magnifier ──▶ Search (push, Back)                       #60
                     │ type ──▶ People + Previous meetings    #61 / #64
                     │           │ person row  ──▶ Person page (push, Back)     #65
                     │           │                  │ note row ──▶ Note page    #10
                     │           │                  └ Ask anything ──▶ Person chat  #66 (phase 7)
                     │           └ meeting row ──▶ Note page (push, Back)       #10
                     │ nonsense ──▶ No results / for “q”       #63
                     └ clear (x) ──▶ empty state, keyboard hidden               #62

Note page ─ meta pill ─▶ Attendees sheet ─ row ─▶ Person page   (repointed from phase 7's chat)
```

Back from a note opened from search returns to search with the query and results intact. Back
from the person page returns to wherever it was opened from.

---

## 3. Screens and states

### 3.1 The search page (`search-screen`) — route `app/search.tsx`

Push presentation with no native header, the same as the note page: a circular 44pt **Back**
(`search-back`, a11y "Back") at the phase-2 nav position (leading 20, top safe area). The
background is `bg.app` `#262626`. The body scrolls under Back. Edge swipe back works.

**The field** is docked at the bottom, above the keyboard when it is up and above the home
indicator when it is not (#60, #61). It is laid out like the discovery row:

- The pill `search-field`: leading 16, height 48, fill `bg.list` `#1A1A1A`, a 1pt `border.hairline`
  `#333333`, fully rounded. It holds:
  - a magnifier glyph at 17pt, in `text.secondary`, 20pt in from the pill's edge;
  - the input `search-input`, starting 12pt after the glyph. It is 17pt SF, `text.primary`, with
    the placeholder **"Search by title, notes, or people"** in `text.tertiary`, the return key
    **Search** (`returnKeyType="search"`), and autocorrect and autocapitalise off. Maestro reaches
    it by `testID`;
  - the clear button `search-clear` (a11y **"Clear search"**), present only when the draft is
    non-empty: a 20pt `text.tertiary` circle with a dark `x`, 16pt from the trailing edge (#61).
- A 9pt gap.
- The keyboard toggle `search-keyboard-toggle`: a 48pt circular icon button (phase-2
  `IconButton`, `bg.iconButton` with a hairline border), trailing 16, with a keyboard glyph. Its
  a11y label is **"Hide keyboard"** while the keyboard is up and **"Show keyboard"** while it is
  down. Tapping it toggles focus on `search-input`.
- 12pt between the row and the top of the keyboard.

The input is focused on mount, so the keyboard opens with the page (#60). Return dismisses the
keyboard and changes nothing else, because results are already live *(designed: discovery never
pressed Search)*.

**Querying.** The draft is trimmed. An empty trimmed draft shows the empty state and sends
nothing. Anything else is sent 250 ms after the last keystroke as `GET /search?q=` *(designed
debounce)*. Results are cached by query (`queryKeys.search(q)`). While the next query is in flight,
the previous results stay on screen (`placeholderData: keepPreviousData`), so typing never flashes
empty. A response for a query that is no longer the draft is never drawn: the query key is the
draft.

**States** (in the body, above the field):

| State | When | What shows |
| --- | --- | --- |
| **Empty** `search-empty` (#60, #62) | trimmed draft is `""` | Centred in the space above the field: a 62pt outline magnifier in `text.secondary` (stroke 1.75), then 16pt, then serif 28/35 **"Search your notes"** (`search-empty-title`, `text.secondary`), then serif 28/35 **"Search by title, notes, or people."** (`search-empty-subtitle`, `text.tertiary`). Both lines are centred with a 20pt side inset and may wrap |
| **Loading** `search-loading` *(designed)* | the first request for a non-empty draft, with no previous results to keep | A small `ActivityIndicator` in `text.secondary`, placed where the magnifier sits in the empty state. It is not a skeleton: the answer is usually back before one would register |
| **Results** `search-results` (#61, #64) | at least one person or meeting | The sections (below). The list scrolls, with 16pt bottom padding above the field |
| **No results** `search-no-results` (#63) | both arrays empty | Centred like the empty state: the same 62pt magnifier, then serif 28/35 **"No results"** (`search-no-results-title`, `text.secondary`), then serif 28/35 **"for “<q>”"** with curly quotes and the trimmed query (`search-no-results-query`, `text.tertiary`). The quoted query is truncated to one line |
| **Error** `search-error` *(designed)* | the request failed | Centred: serif 28/35 **"Couldn’t search your notes."** in `text.secondary`, then a phase-2 dark `PillButton` **"Retry"** (`search-retry`), which refetches the current query |

**Sections** (#61). A header is 17/22 SF regular in `text.secondary`, leading 16. It sits 8pt
below the nav row for the first section, and 31pt below the last row of the section before it.
There is 11pt from a header to its first row.

- **People** `search-section-people`, with the header **"People"**. One row per person, in the API's
  order: `search-person-<i>`, where `<i>` is the 0-based index. The index is used because a person
  key holds `:`, `@` and `.`, which Maestro would read as regex. Each row has the a11y label
  **"<name>, <email>"**, or just "<name>" when there is no email, and is laid out as:
  - leading 16, a 46pt circular avatar (§3.3);
  - 12pt gap, then a text column: the name (`search-person-<i>-name`, 17/22 semibold,
    `text.primary`, one line), then the email (`search-person-<i>-email`, 15/20 regular,
    `text.secondary`, one line). The email line is omitted for a name-only person *(designed)*;
  - the row pitch is 64pt, and the pressed fill is `bg.tileRaised` `#333333`, full width.
- **Previous meetings** `search-section-meetings`, with the header **"Previous meetings"**. One row
  per note: `search-note-<noteId>`, a11y **"<title>, <day>"**, laid out as:
  - leading 16, a 46pt tile with radius 10, fill `accent.oliveDark` `#424625`, and a 22pt document
    glyph (`FileText`) in `accent.olive` `#677B00`;
  - 12pt gap, then the title (`search-note-<noteId>-title`, 17/22 semibold, one line, tail
    truncated) and the day (`search-note-<noteId>-date`, 15/20 `text.secondary`), formatted by
    `formatDayHeader` exactly as home formats a day, e.g. **"Sat 12 Sep"**. Search rows show the
    day, not the time (#61);
  - the row pitch is 64pt, with the same pressed fill.

A section with no rows is not rendered at all, header included (#64).

**Taps.** A person row pushes `/people/<personKey>?name=<name>`. A meeting row pushes
`/notes/<noteId>`. Either one dismisses the keyboard first. Dragging the results list also
dismisses the keyboard (`keyboardDismissMode="on-drag"`).

**Clear** (`search-clear`) empties the draft, returns to the empty state, and **blurs the input**,
so the keyboard goes down and the toggle reads "Show keyboard" (#62).

### 3.2 The person page (`person-screen`) — route `app/people/[personKey].tsx`

Push presentation with no native header: a circular Back (`person-back`, a11y "Back"). The
background is `bg.app`. The route reads `personKey` and an optional `name`. The name paints the
header before the fetch lands, as phase 7's person chat does.

**Header** (#65):

- The avatar `person-avatar`: 62pt circular (§3.3), leading 20, top 16 below the nav row.
- Beside it, with a 12pt gap and top-aligned with the avatar:
  - the name `person-name`: serif 28/34, `text.primary`, up to 2 lines;
  - 4pt below, the email line `person-email`: a 14pt building glyph (`Building2`) in
    `text.tertiary`, 8pt gap, then the address, 15/20 in `text.secondary`, one line with middle
    truncation;
  - 4pt below that, the domain line `person-domain`: a 14pt globe glyph (`Globe`), 8pt gap, then
    the domain (the part after `@`), 15/20 in `text.secondary`.

  A name-only person has no email line and no domain line, and the name is vertically centred on
  the avatar *(designed)*. The self person shows no "(me)" suffix, as in #65, where the person is
  the account holder.
- 24pt below the header block, a hairline separator (`border.hairline`, 1pt), inset 20 on both
  sides.

**Meetings**, 24pt below the separator. The same `SectionList` shape home uses (phase 4), built
from `groupByDay` and `formatDayHeader`:

- a day header `person-day-<yyyy-mm-dd>`, 17/22 in `text.secondary`, leading 20, e.g. **"Sat 12 Sep"**;
- a row `person-note-<noteId>` with a11y **"<title>, <time>"**. It is home's `NoteRowContent`
  (59pt, a 40pt tile with radius 10, the title 17/22 semibold, and the time 15/20 `text.secondary`
  from `formatRowTime`) with one change, the **olive tone**: the tile is `accent.oliveDark`
  `#424625` and the phone glyph is `accent.olive` (#65). Home keeps its grey tile. Title and time
  carry `person-note-<noteId>-title` and `person-note-<noteId>-time`;
- the pressed fill is `bg.tileRaised`. There is no swipe-to-trash and no long-press menu here:
  #65 shows none, and trash belongs to home and the note page;
- the list pages exactly as home's does (`GET /notes?person=…`, keyset). It shows the phase-4
  footer `person-list-more` while the next page loads, and `person-list-more-retry` if that fails;
- the list's bottom padding clears the Ask pill plus 16pt.

**Ask anything** `person-ask-button` (#65): the note page's Ask pill component, reused. It is
floating, leading/trailing 16, 64pt high, 16pt above the home indicator, with fill `bg.list`, a
hairline border and a centred speech-bubble glyph plus **"Ask anything"** at 17/22 semibold. It
pushes `/ask/person/<personKey>?name=<name>`, which is phase 7's screen, unchanged (#66).

**States:**

| State | What shows |
| --- | --- |
| **Loading** `person-loading` *(designed)* | The header draws from `?name=`, with an initial avatar and no email or domain lines yet. Below the separator a centred `ActivityIndicator` in `text.secondary`. The Ask pill is shown and works: its key is already known |
| **Populated** (#65) | As above |
| **Not found** `person-not-found` *(designed)* | `GET /people/{key}` answered 404 `PersonNotFound`, for example because their only note was trashed since the link was made. Centred in the body: serif 28/35 **"This person isn’t in your notes anymore."** in `text.secondary`. There is no Ask pill, because the chat would also 404 |
| **Error** `person-error` *(designed)* | Any other failure of either request. Centred: serif 28/35 **"Couldn’t load this person."**, then a dark `PillButton` **"Retry"** (`person-retry`), which refetches both |

The header and the first page load in parallel. Not found wins over error, and error wins over
loading.

### 3.3 The avatar *(designed)*

Discovery shows photos. The app has no avatars, so every person gets an initial: a circle filled
`bg.tileRaised` `#333333`, with the first letter of the name, or of the email when there is no name,
upper-cased, in `text.primary`. It is 20/25 semibold at 46pt and 26/32 semibold at 62pt.
`initialFor` in `features/home/initial.ts` already computes the letter, and the attendees sheet
already draws this shape at 40pt. It is extracted to `design/Avatar.tsx` (`size` prop) and used by
all three.

### 3.4 Entry points (changes to earlier screens)

- **Home** `home-search-button` (phase 2) pushes `/search`. Until now it was inert.
- **Attendees sheet** (#16): the `attendees-row-<attendeeId>` tap now dismisses the sheet and pushes
  `/people/<personKey>?name=<display name>` instead of the person chat. This is the repoint that
  phase-7 §3.7 promised. A row whose `personKeyOf` is `null` stays disabled. The comment in
  `attendees.tsx` that names the interim entry is updated.

---

## 4. Copy

Every string is verbatim from COPY.md, or marked *(designed)*. No string on these screens names the
product, so nothing needed the reference app's name replaced with "Notes".

| Where | String |
| --- | --- |
| Search empty (#60, #62) | Search your notes · Search by title, notes, or people. |
| Search placeholder | Search by title, notes, or people |
| Section headers (#61) | People · Previous meetings |
| No results (#63) | No results · for “<q>” |
| Search a11y | Back · Clear search · Hide keyboard · Show keyboard |
| Return key | Search |
| Search error *(designed)* | Couldn’t search your notes. · Retry |
| Person page (#65) | Ask anything |
| Person not found *(designed)* | This person isn’t in your notes anymore. |
| Person error *(designed)* | Couldn’t load this person. · Retry |
| Row a11y | "<name>, <email>" · "<title>, <day>" · "<title>, <time>" |

Apostrophes and quotes are typographic (`’`, `“`, `”`), as in the rest of the app.

---

## 5. testIDs

| Screen | testIDs |
| --- | --- |
| Search | `search-screen`, `search-back`, `search-field`, `search-input`, `search-clear`, `search-keyboard-toggle`, `search-empty`, `search-empty-title`, `search-empty-subtitle`, `search-loading`, `search-results`, `search-section-people`, `search-person-<i>`, `search-person-<i>-name`, `search-person-<i>-email`, `search-section-meetings`, `search-note-<noteId>`, `search-note-<noteId>-title`, `search-note-<noteId>-date`, `search-no-results`, `search-no-results-title`, `search-no-results-query`, `search-error`, `search-retry` |
| Person | `person-screen`, `person-back`, `person-avatar`, `person-name`, `person-email`, `person-domain`, `person-loading`, `person-list`, `person-day-<yyyy-mm-dd>`, `person-note-<noteId>`, `person-note-<noteId>-title`, `person-note-<noteId>-time`, `person-list-more`, `person-list-more-retry`, `person-ask-button`, `person-not-found`, `person-error`, `person-retry` |
| Unchanged, reused | `home-search-button`, `attendees-row-<attendeeId>`, `note-screen`, `note-title`, `chat-screen`, `chat-back`, `chat-title`, `chat-chip-0..2` |

*(review, phase 8)* A search row and a person-page row are each one accessibility element, so
their line ids (`-name`, `-email`, `-title`, `-date`, `-time`) exist in the render tree but are
hidden from XCUITest. Flows assert the row id against its label instead: `search-note-<id>` reads
"{title}, {day}", `search-person-<i>` reads "{name}, {email}" (or "{name}"), and
`person-note-<id>` reads "{title}, {time}". The AC table below names the line ids; the flows prove
the same text through the label.

---

## 6. API

### 6.1 Routes

| Route | Request | 200 | Errors |
| --- | --- | --- | --- |
| `GET /search` — `searchRoute` (`packages/domain/src/Search/Contract.ts`, tag `Search`) | query `SearchQuery` `{ q }` | `SearchResults` | 401; 422 when `q` is missing, blank after trimming, or longer than 100 |
| `GET /people/{personKey}` — `getPersonRoute` (`packages/domain/src/People/Contract.ts`, tag `People`) | path `personKey: PersonKey`, URL-encoded by the client (`email%3Apriya%40example.com`) | `Person` | 401; 404 `PersonNotFound` (no live note of the caller's has them as an attendee); 422 on a malformed key |
| `GET /notes?person=` — `listNotesRoute`, extended | `PageQuery` plus an optional `person: PersonKey` | `Page<NoteSummary>`: the caller's live notes with that person as an attendee, in the list's order (startedAt desc, id desc), keyset-paginated with the same cursor | 401; 422 on a malformed key or cursor. An unknown person is an empty page, not a 404: the list does not answer who exists, `GET /people` does |

Every handler is one expression (R6). All three are session-authenticated and scoped to the
caller.

### 6.2 Shapes

```ts
// packages/domain/src/Domain/Person.ts (extends phase 7's PersonKey / personKeyOf)
export const PersonSummary = z.object({
  email: z.string().nullable(),   // null for a name-only person
  isMe: z.boolean(),              // the key equals the caller's own `email:` key
  key: PersonKey,
  name: z.string(),               // most recent non-null name; falls back to the email, then the key's value
});
export const Person = PersonSummary.extend({
  domain: z.string().nullable(),  // after "@", lower-cased; null when email is null
});
export const domainOf = (email: string | null): string | null;  // pure, unit-tested

// packages/domain/src/Domain/Search.ts
export const SEARCH_QUERY_MAX = 100;
export const SEARCH_PEOPLE_LIMIT = 8;
export const SEARCH_NOTES_LIMIT = 50;
export const SearchQuery = z.object({ q: z.string().trim().min(1).max(SEARCH_QUERY_MAX) });
export const SearchNoteHit = z.object({
  id: NoteId,
  source: NoteSource,
  startedAt: Timestamp,
  title: NoteTitle,
});
export const SearchResults = z.object({
  notes: z.array(SearchNoteHit),     // ≤ SEARCH_NOTES_LIMIT
  people: z.array(PersonSummary),    // ≤ SEARCH_PEOPLE_LIMIT
  query: z.string(),                 // the trimmed q, echoed so the client can label "for “q”"
});

// packages/domain/src/Notes/Contract.ts
export const NoteListQuery = PageQuery.extend({ person: PersonKey.optional() });
```

`PersonNotFound` moves from `Chats/Errors.ts` to `packages/domain/src/People/Errors.ts`, and
`Chats/Errors.ts` re-exports it. It is one class, so `on-error.ts` keeps its single mapping.

### 6.3 Matching rules (the service and repositories)

- **Normalisation.** The query is trimmed, then lower-cased. Matching is
  `instr(lower(column), :q) > 0`, which is a literal substring with no wildcards, so `%` and `_` are
  ordinary characters and nothing needs escaping. SQLite's `lower` folds ASCII only. That is
  recorded in §10.
- **Meetings.** These are the caller's live notes (`owner_id = ? and trashed_at is null`) whose
  `title` or `body_markdown` contains the query. They are ordered `started_at desc, id desc`, with
  `limit SEARCH_NOTES_LIMIT`. Transcripts and attendee names are not searched for meetings: a
  person match surfaces under People, and their meetings are one tap away.
- **People.** These are the attendee rows of the caller's live notes. Each row's effective email is
  `coalesce(user.email, note_attendees.email)` and its effective name is
  `coalesce(user.name, note_attendees.name)`, so the owner row reads from `user`, as on the
  attendees sheet. A row matches when its effective name or effective email contains the query.
  Rows are grouped by `personKeyOf(effective)`, and a row whose key is `null` is dropped. The name
  for each person comes from their most recent note (`started_at desc, id desc`) that carries a
  non-null name. `isMe` compares against `email:<caller's email>`. People are ordered by their
  most recent meeting desc, then name ascending (case-insensitive), then key, with
  `limit SEARCH_PEOPLE_LIMIT`. The grouping may be done in SQL or over the matched rows in the
  repository. Either way the repository returns domain `PersonSummary`s (R2).
- **The person match** (`attendeeMatches`, today private to `ChatsRepo`) moves to `@kn/db` as
  `personMatches(key, { email, name })`. `ChatsRepo`, `NotesRepo` (the `person` filter) and
  `PeopleRepo` all import that one fragment, because repositories may not import each other and
  three copies would drift. An `email:` key matches the effective email, lower-cased and trimmed.
  A `name:` key matches only a row with no email, on the normalised name.
- **`GET /people/{key}`** returns the most recent match's name, the email (for an `email:` key,
  the key's value), `domainOf(email)` and `isMe`. It raises `PersonNotFound` when no live note of
  the caller's has a matching attendee. That covers a key found only among another user's
  attendees, and a person whose only note is trashed.
- **Contexts.** `Search/` (`SearchRepo`, `SearchService`, `Http`) and `People/` (`PeopleRepo`,
  `Policy`, `PeopleService`, `Http`) are new contexts that follow the ten-step shape. Neither
  writes. `NotesService.list` gains the optional `person`, and `NotesRepo.listLive` adds the
  `exists (…personMatches…)` predicate when it is set. The keyset and the partial index are
  unchanged.
- **No new tables, no migration.** An index on `note_attendees(lower(email))` is not added. The
  scan is bounded by one owner's notes, which the partial index already selects.

### 6.4 Seed

No fixture changes. The phase-4 notes and phase-7 threads already give each flow a distinct
outcome (computed against `E2E_NOTES` for `usr_e2e_person`):

| q | People | Previous meetings |
| --- | --- | --- |
| `standup` | — | Weekly standup (title) |
| `forty` | — | Launch planning review (body) |
| `ra` | Priya Raman | Launch planning review, Solo reflection thoughts (both body) |
| `priya` | Priya Raman | — |
| `e2e` | E2E Person (self) | — |
| `o` | E2E Person, Priya Raman, Sam Okafor | launch, standup, solo |
| `zzqx`, `archived` (trashed), `other` (another user's) | — | — |

Priya's page shows one day, `2026-09-12`, holding `not_e2e_launch`. The self page shows
`2026-09-12` holding launch and then standup, and `2026-08-05` holding solo. The trashed
`not_e2e_archived` never appears. The fixture's instants keep those local dates stable from UTC-8
to UTC+13 (phase-4 §6.7).

---

## 7. API test cases

`Search/Search.test.ts`, which builds the service over `makeTestD1()` with the E2E seed written
through the fixtures:

1. **Title match.** `standup` → notes `[not_e2e_standup]`, people `[]`. `STANDUP` gives the same
   answer, because matching is case-insensitive.
2. **Body match.** `forty` → `[not_e2e_launch]` only, with no people.
3. **Both sections and order.** `ra` → people `[Priya Raman]`, notes `[launch, solo]` in
   `started_at desc` order. `an` → `[launch, standup, solo]`.
4. **People by email.** `example.com` → `[Priya Raman, Sam Okafor]`. Both last met at launch, so the
   order falls to name.
5. **Self.** `e2e` → one person, with key `email:e2e-person@kothanote.test`, name "E2E Person" (read
   from `user`) and `isMe: true`. After renaming the user through `ProfilesService.update`, the same
   search returns the new name.
6. **Trash.** `archived` → nothing. A guest who attended only a trashed note is not returned as a
   person.
7. **Ownership.** As `person`: `other` and `zebracorn` (a word only in `other`'s note, added by the
   test) → nothing. A guest who attended only `other`'s note is not a person to `person`. As
   `other`: `launch` → nothing.
8. **Empty account.** `empty` searching `a` → both arrays empty.
9. **Literal characters.** `%` → nothing. `_` → `[solo]`, because its body holds a literal
   underscore.
10. **Dedupe.** Two notes carry `Priya@Example.com ` and `priya@example.com` → one person. The name
    comes from the more recent note. A name-only attendee "Dana  Lee" on two notes → one person,
    `name:dana lee`, with `email: null`. An attendee with both an email and a name is keyed by the
    email.
11. **Caps.** 60 matching notes → 50, newest first. 12 matching people → 8.
12. **Validation** (in the HTTP test): `q` of `"   "`, a missing `q`, and 101 characters are each
    422.

`People/People.test.ts`:

13. `email:priya@example.com` → `{ name: "Priya Raman", email: "priya@example.com", domain:
    "example.com", isMe: false }`.
14. The self key → `isMe: true`, with the domain `kothanote.test`.
15. A `name:` key → `email: null`, `domain: null`.
16. Each of these raises `PersonNotFound`: an unknown key, a key found only among `other`'s
    attendees, and a key whose only note is trashed.
17. `domainOf`: `null`, an address with no `@` (→ `null`), and upper-case (→ lower-cased).

`Notes/Notes.test.ts` (extended):

18. `list(person, { person: "email:priya@example.com" })` → `[not_e2e_launch]`. The self key →
    `[launch, standup, solo]`, with archived excluded.
19. Paging under the filter: `limit 1` walks launch → standup → solo, and `nextCursor` is `null`
    on the last page.
20. An unknown person → an empty page with `nextCursor: null`. Another user's guest → an empty
    page.

`Chats/Chats.test.ts`: the existing person-scope cases still pass after `attendeeMatches` moves to
`@kn/db` (a regression, with no new case).

The HTTP suites cover wire shape, not rules:

- `Search/Search.http.test.ts`: 200 parses as `SearchResults`, 401 without a session, 422 on a
  blank `q`.
- `People/People.http.test.ts`: 200 through a URL-encoded key parses as `Person`, 401, 404
  `PersonNotFound` as the error body, and 422 on `person:priya` (a bad prefix).
- `Notes/Notes.http.test.ts`: `?person=` with a malformed key → 422.
- `apps/api` `app.test.ts`: `/search` and `/people/{personKey}` are mounted and appear in the
  OpenAPI document under the `Search` and `People` tags, and `PersonNotFound` still maps to 404.

---

## 8. Acceptance criteria and flows

Every flow starts from `clearState` + `clearKeychain` + reset/seed, and signs in fast as `person`
through `subflows/open-home.yaml`. Tags: `phase-8`, `regression`. Flows select by `id`. Text is
asserted only as a property of an id. There is no `sleep`: every wait is `extendedWaitUntil`, which
also absorbs the 250 ms debounce. `config.yaml` gains `phase-8/*`.

New Maestro pieces:

- `subflows/open-search.yaml`: taps `home-search-button`, then waits for `search-screen`,
  `search-empty` and `search-input`;
- `subflows/search-for.yaml` (`QUERY`): taps `search-input`, runs `eraseText`, then
  `inputText: ${QUERY}`.

| # | Given / When / Then | Flow |
| --- | --- | --- |
| AC1 | **Given** `person` on home, **when** they tap `home-search-button`, **then** `search-screen` shows `search-back`; `search-empty-title` reads "Search your notes"; `search-empty-subtitle` reads "Search by title, notes, or people."; there is no `search-clear`; and `search-keyboard-toggle` has the label "Hide keyboard" (the keyboard opened by itself). **When** they tap the toggle, **then** its label reads "Show keyboard". **When** they tap it again, **then** it reads "Hide keyboard". **When** they tap `search-back`, **then** `home-screen` is visible. | `apps/native/.maestro/phase-8/search-empty.yaml` |
| AC2 | **Given** search is open, **when** they type "standup", **then** `search-section-meetings` is visible; `search-note-not_e2e_standup-title` reads "Weekly standup" and `search-note-not_e2e_standup-date` reads "Sat 12 Sep"; there is no `search-section-people` and no `search-note-not_e2e_launch`. **When** they tap the row, **then** `note-screen` shows `note-title` "Weekly standup". **When** they go back, **then** `search-input` still holds "standup" and the row is still visible. | `apps/native/.maestro/phase-8/search-title-match.yaml` |
| AC3 | **Given** search is open, **when** they type "forty" (a word only in launch's body), **then** `search-note-not_e2e_launch-title` reads "Launch planning review"; there is no `search-section-people`; and there are no `search-note-not_e2e_standup` or `search-note-not_e2e_solo` rows. | `apps/native/.maestro/phase-8/search-body-match.yaml` |
| AC4 | **Given** search is open, **when** they type "ra", **then** `search-section-people` shows `search-person-0-name` "Priya Raman" and `search-person-0-email` "priya@example.com", with no `search-person-1`; and `search-section-meetings` shows `search-note-not_e2e_launch` above `search-note-not_e2e_solo` (asserted with `below`/`above` relations). **When** they tap `search-clear`, **then** `search-empty` is visible, `search-clear` is gone, and `search-keyboard-toggle` reads "Show keyboard". | `apps/native/.maestro/phase-8/search-sections.yaml` |
| AC5 | **Given** search is open, **when** they type "zzqx", **then** `search-no-results-title` reads "No results" and `search-no-results-query` reads "for “zzqx”", with no `search-results`. **When** they replace the query with "archived" (a trashed note's title), **then** `search-no-results-query` reads "for “archived”". **When** they replace it with "other" (another user's note title), **then** it reads "for “other”". | `apps/native/.maestro/phase-8/search-no-results.yaml` |
| AC6 | **Given** search is open, **when** they type "priya" and tap `search-person-0`, **then** `person-screen` shows `person-name` "Priya Raman", `person-email` containing "priya@example.com", `person-domain` containing "example.com", `person-day-2026-09-12` reading "Sat 12 Sep", and `person-note-not_e2e_launch-title` "Launch planning review", with no `person-note-not_e2e_standup`. **When** they tap `person-note-not_e2e_launch`, **then** `note-title` reads "Launch planning review". **When** they go back, **then** `person-screen` is visible. **When** they tap `person-back`, **then** `search-screen` is visible with "priya" still in `search-input`. | `apps/native/.maestro/phase-8/search-person.yaml` |
| AC7 | **Given** search is open, **when** they type "e2e", **then** `search-person-0-name` reads "E2E Person" and there is no `search-section-meetings`. **When** they tap it, **then** `person-day-2026-09-12` holds `person-note-not_e2e_launch` above `person-note-not_e2e_standup`, and `person-day-2026-08-05` ("Wed 5 Aug") holds `person-note-not_e2e_solo`. There is no `person-note-not_e2e_archived` and no `person-note-not_e2e_other`. `person-domain` contains "kothanote.test". | `apps/native/.maestro/phase-8/person-self.yaml` |
| AC8 | **Given** Priya's person page (as in AC6), **when** they tap `person-ask-button`, **then** `chat-screen` shows `chat-back`; `chat-title` reads "Priya Raman"; and `chat-chip-0`..`2` read "List action items", "Write follow-up email", "List Q&A". **When** they tap `chat-back`, **then** `person-screen` is visible. | `apps/native/.maestro/phase-8/person-ask.yaml` |
| AC9 | **Given** `not_e2e_launch` is open, **when** they tap `note-meta-pill` and then `attendees-row-att_e2e_launch_2` (Sam Okafor), **then** the sheet closes and `person-screen` shows `person-name` "Sam Okafor" and `person-note-not_e2e_launch`. **When** they tap `person-back`, **then** `note-screen` is visible. | `apps/native/.maestro/phase-8/attendee-person.yaml` |

Flows from earlier phases that this phase changes:

- `phase-2/home-shell-inert.yaml` stops tapping `home-search-button`, because the button now
  navigates. AC1 owns it. Its header comment says so.
- `phase-7/ask-person.yaml` (phase-7 AC4) goes through the person page: attendee row →
  `person-screen` → `person-ask-button` → `chat-screen`. The rest of the flow is unchanged. Its
  header comment names this spec.

The whole suite for phases 2–7 must still pass.

Screenshots for the visual check (`TESTING.md` §8), each compared by eye with its discovery shot
before review:

| Screenshot | From flow | Compare with |
| --- | --- | --- |
| `phase-8-search-empty` | AC1 | #60 |
| `phase-8-search-results` | AC4 | #61 |
| `phase-8-search-cleared` | AC4 | #62 |
| `phase-8-search-no-results` | AC5 | #63 |
| `phase-8-search-body` | AC3 | #64 |
| `phase-8-person` | AC7 | #65 |
| `phase-8-person-chat` | AC8 | #66 |

---

## 9. Designed states no flow reaches

- `search-loading`: the fake API answers inside the debounce, so the indicator is gone before
  Maestro can see it. It is unit-tested through the pure `searchViewState(draft, query)` function,
  which returns `empty | loading | results | none | error`;
- `search-error`, `person-error`, `person-list-more-retry`: these need a request to fail on
  demand;
- `person-not-found`: this needs a stale link. It could be reached by trashing Priya's only note
  and then deep-linking, but no flow does. `personViewState` unit-tests it;
- a name-only person's header: the seed has no name-only guest. It is covered by the API test (15)
  and by a render-free unit test of `personLines(person)`.

These belong to the same scripted-response harness seam that `BLOCKERS.md` defers for phases 3–7.

---

## 10. Blockers to record

- **Search is substring, not ranked or full-text.** `instr(lower(…))` over one owner's notes is
  enough for a personal corpus and for proving scoping. An FTS5 table (and ranking, and snippets,
  which discovery does not show anyway) is a later change behind the same route.
- **Case folding is ASCII-only.** SQLite's `lower` does not fold `É`, so "émile" does not find
  "Émile". The fix is FTS5 with `unicode61`, or a lower-cased shadow column written by the
  repository.
- **Transcripts are not searched.** Discovery's copy scopes search to "title, notes, or people".
  Chat retrieval (phase 7) does read transcripts. Recorded, not built.
- **Search results are capped, not paged** (8 people, 50 meetings). A `nextCursor` can be added to
  `SearchResults` without breaking clients.
- **No avatars.** People get an initial (§3.3) until an avatar source exists (a calendar provider
  in phase 11, or an uploaded profile photo).

---

## 11. Task split

### API (packages/domain, packages/server, packages/db, apps/api, packages/apiclient)

1. `packages/domain`:
   - `Domain/Person.ts`: add `PersonSummary`, `Person` and `domainOf`, with cases in
     `Domain/Person.test.ts`;
   - `Domain/Search.ts`: `SearchQuery`, `SearchNoteHit`, `SearchResults` and the three constants,
     with `Domain/Search.test.ts` (trim, bounds);
   - `People/Errors.ts`: `PersonNotFound` moves here, and `Chats/Errors.ts` re-exports it;
   - `People/Contract.ts` (`getPersonRoute`) and `Search/Contract.ts` (`searchRoute`);
   - `Notes/Contract.ts`: `NoteListQuery` with the optional `person`, used by `listNotesRoute`,
     with its description updated.
2. `packages/db`: export `personMatches(key, { email, name })` (moved from `ChatsRepo`'s
   `attendeeMatches`) from a small module such as `src/person-match.ts`. No schema change, no
   migration, no `RESET_ORDER` change.
3. `packages/server/src/Chats/ChatsRepo.ts`: import `personMatches` from `@kn/db` and delete the
   private copy. The existing chat tests must stay green.
4. `packages/server/src/Notes/`:
   - `NotesRepo.listLive` takes an optional `person` and adds the `exists` predicate;
   - `NotesService.list` passes it through;
   - `Http.ts` stays one expression;
   - add cases 18–20 to `Notes.test.ts` and the 422 to `Notes.http.test.ts`.
5. `packages/server/src/People/`: `PeopleRepo.ts` (`personForOwner`, which returns the
   name/email, or `null`), `Policy.ts`, `PeopleService.ts` (`get(actor, key)`, which raises
   `PersonNotFound`), `Http.ts`, `People.test.ts` (13–17) and `People.http.test.ts`.
6. `packages/server/src/Search/`: `SearchRepo.ts` (`notesMatching(ownerId, q, limit)` and
   `peopleMatching(ownerId, callerEmail, q, limit)`, which return domain types), `SearchService.ts`
   (normalises `q`, reads the caller's email through the actor, and runs both queries),
   `Http.ts`, `Search.test.ts` (1–11) and `Search.http.test.ts` (12).
7. `container.ts`: wire `PeopleService` and `SearchService` under `traced()`. In `apps/api`, mount
   both routers, add the `People` and `Search` OpenAPI tags, and extend `app.test.ts`.
8. `packages/apiclient`:
   - `search.ts` (`search(q)`) and `people.ts` (`getPerson(key)`, which URL-encodes the key);
   - `notes.ts`: the list accepts `{ person }`;
   - query keys `search(q)`, `people.detail(key)` and `notes.list({ person })`, kept distinct from
     home's `notes.list()`, so a trash or rename that invalidates `notes` also refreshes a person
     page.
9. Add the §7 scenario names to `docs/TESTING.md` §4 and the §10 blockers to
   `docs/plan/BLOCKERS.md`.

### Native (apps/native)

1. Routes: `src/app/search.tsx` and `src/app/people/[personKey].tsx` (push, no header),
   registered in `_layout.tsx`.
2. `features/search/`:
   - `SearchScreen.tsx` (nav, body states, results list);
   - `SearchField.tsx` (the docked pill, clear button, keyboard toggle, keyboard-aware docking, the
     same mechanism phase 7's `Composer` uses);
   - `SearchRows.tsx` (`PersonRow`, `MeetingRow`, section headers);
   - `useSearch.ts` (a 250 ms debounce, `useQuery` keyed on the trimmed draft,
     `keepPreviousData`);
   - `viewState.ts` (`searchViewState`), with a unit test;
   - `copy.ts`.
3. `features/people/`:
   - `PersonScreen.tsx` (header, separator, a day-grouped `SectionList` over
     `useInfiniteQuery(notes.list({ person }))`, footer, Ask pill, states);
   - `PersonHeader.tsx`;
   - `viewState.ts` (`personViewState`, `personLines`), with a unit test;
   - `copy.ts`.
4. Shared pieces:
   - `design/Avatar.tsx`, extracted from the attendees sheet and used by it, the search rows and
     the person header;
   - `NoteRowContent` gains a `tone: "default" | "olive"` prop;
   - the note page's Ask pill is extracted as `features/notes/AskPill.tsx` (or reused as is), so
     the person page draws the same one.
5. Wiring:
   - `home-search-button` gets `onPress={() => router.push("/search")}`;
   - attendees-sheet rows push `/people/[personKey]` instead of `/ask/person/[personKey]`.
6. Maestro:
   - the subflows `open-search.yaml` and `search-for.yaml`;
   - the nine `phase-8/*.yaml` flows in §8;
   - `config.yaml` adds `phase-8/*`;
   - the `phase-2/home-shell-inert.yaml` and `phase-7/ask-person.yaml` edits;
   - the §8 screenshots;
   - `TESTING.md` §8's layout list.
