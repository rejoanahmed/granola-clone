# Phase 7 — Ask / chat

Ask is a chat over the caller's own notes. It opens in one of three **scopes**: **global**, from
the home "Ask anything" pill (#70); **note**, from the note page's pill (#19, #43); and
**person**, for one attendee (#66). A question streams back an answer from a fake LLM. Above the
answer, a tool-activity disclosure, "Loaded notes >", opens an **Activity** sheet (#26, #27). The
answer carries numbered **citation chips**, and each one opens a **note preview** sheet (#28).
Under the answer sit the actions **Copy**, thumbs up and thumbs down. Every thread is kept in one
**Chat History** sheet, which you can search and where a row can be pinned or deleted (#24,
#72–#74). The empty state shows a greeting (global only) and **suggestion chips**: four global
(#70, #71) and three scoped (#19, #44). The composer has a rotating placeholder, a mic/send toggle
(#19–#21) and a **model picker** backed by a fake model list (#22).

**Retrieval runs over the caller's own live notes only.** It happens in the service, in SQL
filtered on `owner_id`, before the LLM is called. The LLM never sees a note it was not handed, so
no prompt can widen what it can read.

Discovery **never sent a message**, so it saw an existing thread (#25) but no loading, streaming,
error or empty-history states. It also never saw a pinned row or the result of a history search.
This spec designs those states in the same visual language and marks each one *(designed)*.

Screens: `#NN` is `<discovery>/screens/NN-*/`. Tokens come from the discovery
README and `apps/native/src/design/tokens.ts`. Layout numbers are iOS points on the 428pt discovery
device. The app runs at 402pt, so horizontal measurements are relative to the 20pt phase-2
gutter. The discovery device reads its accessibility ids as `chatInputBar`, `chatSendButton` and
so on. The app uses its own `chat-*` ids (§5), because every flow here selects by `testID` in
`<screen>-<thing>` form.

---

## 1. Scope

| In | Out (and where it goes) |
| --- | --- |
| Global chat as a modal from home (#70), with the greeting and 4 chips (#70, #71) | Photo attachments: the paperclip renders but does nothing except a toast (§3.2) |
| Note-scoped chat pushed from the note page (#19, #43, #44), with 3 chips | Dictation: the mic renders but does nothing except a toast. Settings > Chat's "Auto-send chat dictation" (#86) belongs to phase 10 |
| Person-scoped chat (#66), reached in this phase by tapping an attendee row in the attendees sheet (#16) *(designed interim entry)*. Phase 8 adds the person page (#65) and its Ask pill, which open the same screen | Copy response as image (#25): no button |
| The composer: rotating placeholder, mic/send toggle, keyboard auto-open (#19–#21) | Text selection menus on messages (#29): messages are selectable system text, so nothing is built for it |
| The model picker over a fake model list, persisted per user (#22) | A real LLM or real models (blocker, §10) |
| A streamed answer, the "Loaded notes" disclosure, the Activity sheet with expandable steps (#25–#27) | Stopping an answer mid-stream (never seen; §9) |
| Citation chips and the note preview sheet (#25, #28) | Opening the full note from the preview (never seen) |
| Copy, thumbs up and thumbs down on an answer (#25) | Sharing a chat |
| The Chat History sheet: recency groups, search, swipe (#73) and long-press (#74) Pin and Delete (#24, #72) | Editing or deleting a single message |
| New chat from a thread (#25, #30), and opening a thread from history (#25) | |
| API: threads, messages, the SSE answer stream, retrieval, the LLM port's chat methods and fake, model preference, history search/pin/delete, feedback | |

---

## 2. Journey

```
Home "Ask anything" ───────────▶ Global chat (modal, x)          #70
Note page "Ask anything" ──────▶ Note chat (push, Back)          #19 / #43
Attendees sheet row ───────────▶ Person chat (push, Back)        #66   (designed entry; phase 8: #65)

Empty chat ── chip tap / type + Send ──▶ Thread (streaming → answered)          #25
   │                                         │ "Loaded notes >"   ──▶ Activity sheet    #26 → #27
   │                                         │ citation chip "1"  ──▶ Note preview      #28
   │                                         │ Copy · 👍 · 👎
   │                                         │ New chat           ──▶ Empty chat (same scope)  #30
   └── clock ─────▶ Chat History sheet  #24 / #72
                      │ tap row      ──▶ that thread, loaded into the chat screen    #25
                      │ swipe left   ──▶ Delete · Pin                                #73
                      │ long-press   ──▶ Pin · Delete menu                           #74
                      └ search field ──▶ filtered rows / "No results"               (designed)
```

---

## 3. Screens and states

### 3.1 The chat screen (`chat-screen`)

There is one screen component, `features/chat/ChatScreen.tsx`, with three routes:

| Route | Presentation | Left control | Title (`chat-title`) |
| --- | --- | --- | --- |
| `app/ask/index.tsx` (global) | `presentation: "modal"` (iOS page sheet: the parent shows dimmed and its top peeks out behind the grabber, #70) | circular **x** `chat-close` (a11y "Close") | empty while the thread is new; the thread's title once it has one |
| `app/ask/note/[noteId].tsx` | push | circular **Back** `chat-back` | the note's title (#19); the thread's title once opened from history |
| `app/ask/person/[personKey].tsx` (`?name=` carries the display name for the first paint) | push | circular **Back** `chat-back` | the person's name (#66); the thread's title once opened from history |

Every route accepts `?thread=<ChatThreadId>`. With it, the screen opens that thread (§3.5), and
its scope comes from the thread, not the route. The same holds for a thread loaded from Chat
History: the screen adopts the thread's scope (chips, placeholder and empty-state title), and New
chat returns to an empty chat of that scope.

**Nav row** (#19, #25): y 47–91. The left control is a 44pt circle at the gutter, drawn like the
phase-2 `IconButton` (`#1E1E1E` + 1pt `#333` border). The title is centred, SF Pro 20pt semibold
(`typography.title`), one line with a tail ellipsis, and sits between the two controls. On the
right:

- **Empty thread:** one 44pt circle, **Chat history** (`chat-history-button`, clock-arrow
  glyph). #19 and #70 show it. **New chat is hidden** in the empty state (#30).
- **Thread with messages:** a 96×44 capsule (`ToolbarCapsule`) holding **New chat**
  (`chat-new-button`, square-and-pencil glyph, a11y "New chat") and **Chat history**. #25 shows it.

Content scrolls under the nav row. The row has no background of its own; the screen is `#262626`.

**Keyboard:** the input is focused on mount, so the keyboard rises with the screen (#19, #70). This
applies to an empty chat only. A thread opened from history does not autofocus, so the answer stays
readable (#25).

#### State A — empty (#19, #43, #66, #70, #30)

- **Global greeting** (`chat-greeting`): serif display 40pt (`typography.display`), `#FCFDF8`,
  left-aligned at the gutter + 3, vertically centred in the space between the nav row and the
  chips (#70 has the greeting's baseline at about y 205 with the keyboard up). The text is
  **"Hi <firstName>, ask anything"**, where `firstName` is the first whitespace-separated word of
  the profile name. With no name it reads **"Ask anything"** *(designed)*. **Scoped chats show no
  greeting**, and the area stays empty (#19, #66).
- **Chips** (`chat-chips`, a horizontal `ScrollView`, no indicator): each chip `chat-chip-<i>`
  (0-based) is 42pt tall, radius pill, fill `#2A2A2A`, text 17pt `#F0F0EE` (use
  `colors.text.primary`), 12pt horizontal padding, 8pt apart. The first chip starts at x 16 (the
  scroller's content inset is 16, not the 20 gutter, #19). The row sits 12pt above the composer. It
  scrolls, and the last chip ends 16pt from the right edge (#44, #71). A chip **sends
  immediately**: its text becomes the user message, exactly as if it had been typed and sent.
  - Global (#70): *Who have I promised to follow up with?* · *What needs my attention first?* ·
    *Catch me up on what's important* · *What are the top customer issues?*
  - Note and person (#19, #66): *List action items* · *Write follow-up email* · *List Q&A*
- The chips show **only in the empty state**. They go as soon as the first message is sent, and #25
  has none.

#### State B — thread (#25)

A vertical list (`chat-thread`) above the composer, with its bottom inset equal to the composer's
height + 12. It auto-scrolls to the bottom when a message is sent and while tokens stream, **unless**
the user has scrolled up more than 80pt. In that case it stays where it is *(designed)*.

Turn `n` (0-based, in thread order):

- **User message** (`chat-user-<n>`): right-aligned bubble. Its right edge is at the gutter, and it
  is at most 75% of the screen width. Fill `#2A2A2A` (`colors.bg.sheet`), radius 22, padding 12
  vertical and 16 horizontal, 17pt `#FCFDF8`, selectable. Its top is 24pt under the nav row (#25:
  y 125), and turns are 32pt apart.
- **Assistant answer** (`chat-answer-<n>`): no bubble, full width at the gutter + 8 (#25: x 28).
  From top to bottom:
  1. **Activity row** (`chat-answer-<n>-activity`), 28pt tall. A 22pt tile (`#1A1A1A`, radius 6, 1pt
     `#333` border) holds a doc glyph. After it, 17pt `#8A8A8A` text and a chevron-right, 13pt
     `#8A8A8A`. The a11y label is `"<label>, <k> tools: <tool names>"`, for example
     *"Loaded notes, 2 tools: List meetings, Read meetings"* (#25). Tapping it opens the Activity sheet
     (§3.3). Its label, by state:
     - while retrieval runs, **"Searching notes..."** with a `#8A8A8A` spinner in place of the
       chevron *(designed)*;
     - once notes were opened, **"Loaded notes"** (#25);
     - when nothing was found, **"Searched notes"** *(designed)*.
  2. **Body** (`chat-answer-<n>-body`, blocks `chat-answer-<n>-block-<i>`): the markdown drawn by the
     phase-4 renderer (`features/notes/NoteMarkdown.tsx`) at 17pt, line height 32 (#25's loose
     leading), `#FCFDF8`. It handles bold, bullets and paragraphs, 8pt below the activity row.
     Selectable.
  3. **Citation chips**: every `[k]` marker in the markdown is replaced inline with a 26pt circle
     (`chat-answer-<n>-cite-<k>`), fill `#333333`, digit 15pt `#FCFDF8`, 4pt from the preceding
     word (#25: "“nodes.” (1)"). The a11y label is "Source <k>: <note title>". Tapping one opens the
     note preview (§3.4). A marker whose `k` has no citation is dropped, with the space before it.
  4. **Action row** (`chat-answer-<n>-actions`), 12pt under the body: 32pt glyph buttons 6pt apart
     (#25: x 28, 66, 104, 142). The glyphs are 20pt `#8A8A8A`. Copy as image is out of scope, so
     only three remain:
     - **Copy** (`chat-answer-<n>-copy`, clipboard glyph, a11y "Copy response") copies the answer's
       markdown with the markers stripped, and shows the toast **"Copied to clipboard"** (the
       phase-4 toast copy);
     - **Positive feedback** (`chat-answer-<n>-up`, thumbs-up, a11y "Send positive feedback");
     - **Negative feedback** (`chat-answer-<n>-down`, thumbs-down, a11y "Send negative feedback").

     A selected thumb is drawn **filled** in `#FCFDF8` with `accessibilityState.selected = true`, and
     the other thumb is cleared *(designed)*. Tapping the selected thumb again clears it. The change
     is optimistic. If `PUT …/feedback` fails, it reverts and shows the toast **"Couldn’t save
     feedback. Try again."** *(designed)*.

     The action row appears only once the answer is `complete`.

**Streaming** *(designed; discovery never sent)*: tapping Send (or a chip, or the keyboard's
**Send** return key, #70) does four things:

1. The user bubble appears at once (optimistic).
2. The draft clears. The button stays the olive send arrow, disabled, until the answer ends
   (below); it returns to the mic then, if the draft is still empty.
3. The answer area shows the activity row with "Searching notes..." and its spinner.
4. `chat-answer-<n>-status` reads **"Thinking..."** in 17pt `#8A8A8A`, with a 1.2 s opacity pulse
   between 0.4 and 1.

Once the `citations` event arrives, the row reads "Loaded notes" or "Searched notes". On the first
`token`, the status line is replaced by the growing body. Tokens are appended as they arrive and
never re-laid out from the top. When `done` arrives, the action row appears, and the nav title
takes the thread's title (it animates as a 150 ms cross-fade).

**While an answer streams:** the input stays editable, but `chat-send` is **disabled** (the olive
fill at 40% opacity, `accessibilityState.disabled`), the chips are gone, and New chat and History
still work. Leaving the screen does not cancel the answer. The server finishes and stores it
(§6.4), and it shows the next time the thread is opened.

**Answer failed** *(designed)*: the activity row keeps whatever label it reached, and
`chat-answer-<n>-status` reads **"Couldn’t answer that."** in `#FCFDF8` 17pt. It has a
`#FE4346` alert-circle glyph before it and an inline **"Retry"** text button
(`chat-answer-<n>-retry`, 17pt semibold `#FCFDF8`, underlined) after it. There is no action row.
Retry calls `POST /chats/{id}/messages/{messageId}/retry` (§6.1), and the turn goes back to
streaming in place. A failed network call before any event arrives does the same.

#### State C — loading a thread (`?thread=`)

The nav row appears at once, with the history row's title passed through as a param. A centred
`#8A8A8A` spinner (`chat-loading`) fills the list area. The composer is visible and usable, and
sending while loading is disabled.

#### State D — thread failed to load *(designed)*

The list area is replaced by **"Couldn’t load this chat."** (17pt `#A8AAA1`, centred) and a
**"Retry"** pill (`chat-error-retry`, phase-2 `PillButton` tone `sheet`) 16pt below it. Both sit in
`chat-error`. A 404 (deleted elsewhere, or somebody else's) shows **"This chat no longer exists."**
with no Retry, and the composer is hidden.

### 3.2 The composer (`chat-input-bar`, #19–#21, #25)

The card is inset 16pt from each side (#19: x 16–412), fill `#1A1A1A` (`colors.bg.list`), radius
28, and it has no border. It sits 12pt above the keyboard or, with the keyboard down, above the
bottom safe area.

- **Input** (`chat-input`): multiline, 17pt `#FCFDF8`, caret `colors.accent.lime` (#19's lime
  caret), padding 16 left and 12 top. It grows with its content to 5 lines, then scrolls. The
  return key is **Send** (`returnKeyType="send"`, `submitBehavior="submit"`), and it sends a
  non-blank draft. The draft is trimmed before sending and capped at `CHAT_MESSAGE_MAX` (4 000)
  characters.
- **Placeholder**, 17pt `#8A8A8A`:
  - Scoped: always **"Ask anything"** (#19, #66).
  - Global: rotates every 4 s through **"Ask anything" → "Who did I meet with?" → "Summarize my
    meetings this week"**, with a 200 ms cross-fade, and only while the draft is empty and the input
    is not being typed in (#70 and #25 caught two of the three). The rotation is a pure function,
    `placeholderAt(scope, tick)`, so it is unit-tested. Flows never assert the placeholder text.
- **Controls row**, 40pt tall and 8pt under the text, 8pt insets inside the card:
  - **Attachment** (`chat-attach`): a 40pt circle, fill `#262626`, paperclip glyph 20pt
    `#A8AAA1`, a11y "Add attachment". Tapping it shows the toast **"Attachments aren’t available
    yet."** *(designed; photos are out of scope)*.
  - **Model pill** (`chat-model-button`), 4pt after the paperclip: 40pt tall, fill `#262626`,
    radius pill, padding 16, with the label `chat-model-label` (17pt `#FCFDF8`, the selected
    model's short label, "Auto" by default) and a chevron-down 13pt. Its a11y is
    `"Chat model: <label>"`. Tapping it opens the model menu (§3.6).
  - **Mic/Send** (`chat-send`), right-aligned: the phase-2 `SendButton`, 40pt. With an empty
    draft, it is `idle`: the mic glyph on pale lime `#E5EACC`, a11y **"Hold to dictate"**. Tapping
    it shows the toast **"Dictation isn’t available yet."** *(designed)*. With a non-blank draft, it
    is `active`: the up-arrow on olive `#677B00`, a11y **"Send"** (#20). While an answer streams,
    it is `active` but disabled (§3.1).

### 3.3 Activity sheet (`chat-activity-sheet`, #26, #27)

A formSheet in the phase-2 `SheetChrome` at the `0.55` detent (#26's grabber is at y 942/2000 of
the shot, about 0.53 down). The fill is `colors.bg.sheet` `#2A2A2A`, with a circular **x**
(`chat-activity-close`) at the left and the centred title **"Activity"** in 20pt semibold.

The body is a vertical timeline at the gutter + 12. Each step `chat-activity-step-<i>` is a 48pt
row: a 26pt glyph tile (1pt `#8A8A8A` border, radius 6), then 17pt medium `#E8E8E3` text, then a
chevron-right at the right gutter on steps that can expand. A 1pt `#5A5A5A` connector line joins
consecutive tiles (#26). The steps come from the message's `activity` (§6.2):

| Step `kind` | Glyph | Label | Expands to |
| --- | --- | --- | --- |
| `search` | magnifier | "1 note result" / "<n> note results" / **"No note results"** *(designed)* | the found notes (#27) |
| `open` | doc | "Opened 1 meeting" / "Opened <n> meetings" | the opened notes |
| `done` | check-circle | **"Done"** (a11y "All tool activity complete") | — |

Tapping an expandable step rotates its chevron to point down (200 ms) and lists its notes
underneath, indented to the label. Each note is a 44pt row
(`chat-activity-step-<i>-note-<noteId>`): the phase-4 note tile glyph (`IconTile`, 28pt), the
title in 17pt, and a chevron (#27). Tapping one **replaces** this sheet with the note preview for
that note (§3.4). #27 only guessed at this ("presumably"), so it is *(designed)*.

### 3.4 Note preview sheet (`citation-sheet`, #28)

A formSheet at the `0.55` detent, fill `#333333` (`colors.bg.tileRaised`; #28 is lighter than the
other sheets). The **x** (`citation-close`) is at top-left with no title in the chrome. Then:

- the title (`citation-title`) in serif 34pt (`typography.displaySheet`), 16pt under the x;
- the metadata pill (`citation-meta-pill`), 16pt under that, in the phase-4 note-page pill style:
  calendar glyph, `MMM d h:mm a` ("Aug 5 2:39 PM") and the owner's avatar initial. It is not
  tappable here;
- the body (`citation-body`, blocks `citation-block-<i>`), 16pt under the pill, drawn by
  `NoteMarkdown`.

It scrolls, with the `ScrollView` as the sheet's root (BLOCKERS.md, "Sheets with a scroller must
make it the screen's root").

It reads `GET /notes/{id}` through the existing `noteQuery`. The states:

- **loading**: a centred spinner (`citation-loading`);
- **404**: **"This note is no longer available."** (`citation-unavailable`) *(designed)*;
- **trashed** (`trashedAt` set): the same "no longer available" line, because a trashed note does
  not answer questions either;
- **error**: **"Couldn’t load the note."** with a Retry pill (`citation-retry`) *(designed)*.

### 3.5 Chat History sheet (`chat-history-sheet`, #24, #72, #73, #74)

A formSheet at the `0.55` detent (#24's grabber is at y 942/2000), fill `#1C1C1C`. Add
`colors.bg.history` for it. The **x** (`chat-history-close`, a11y "Close chat history") is at the
left, with the centred title **"Chat History"** in 20pt semibold. The sheet is the same from every
scope: history is **global** (#24, #72).

- **Search field** (`chat-history-search`), docked at the bottom above the safe area and the
  keyboard: 50pt tall, fill `#262626`, radius pill, inset 36pt from each side (#24: x 53–375 of
  428). It has a magnifier glyph and the placeholder **"Search"** in 17pt `#8A8A8A`. Typing
  debounces 250 ms and refetches `GET /chats?q=`. There is a clear (x) button while text is
  present (`chat-history-search-clear`) *(designed)*.
- **Sections** (`chat-history-section-<key>`): the header is 17pt medium `#A8AAA1` at the
  gutter + 4 (#24: "Older" at x 51 of 924 display px, about 24pt on the 428pt device), with 24pt
  above it and 16pt below. The rows' titles share that edge. Groups by the thread's
  `updatedAt` in the device's zone, in this order, and an empty group is not drawn:
  - **Pinned** *(designed)*, every pinned thread, whatever its date;
  - **Today**;
  - **Yesterday**;
  - **Previous 7 days**;
  - **Older** (#24).
  Only "Older" was seen, and the others follow its style. The grouping is a pure function,
  `groupThreads(threads, now, zone)`.
- **Row** (`chat-history-row-<threadId>`), 64pt: the title (`chat-history-row-<id>-title`) in
  17pt semibold `#FCFDF8`, one line. Under it, 17pt `#A8AAA1`: the preview
  (`chat-history-row-<id>-preview`), which is the last assistant message's content, raw markdown
  (#24 shows `**`), newlines collapsed, one line with a tail ellipsis. Then **" · "** and the date:
  `h:mm a` for Today, `d MMM` otherwise ("5 Aug", #24), right-aligned at the gutter. A pinned row
  also shows a 13pt pin glyph before the title *(designed)*. Tapping a row closes the sheet and
  loads that thread into the chat screen that opened it (§3.1, `?thread=`), keeping that screen's
  presentation (a modal stays a modal, #25 stayed pushed).
- **Swipe left** (#73): two trailing capsules, each 56pt wide, 40pt tall, radius pill, 8pt apart,
  with a 15pt `#A8AAA1` caption under each. They reuse phase 4's `ReanimatedSwipeable` row pattern
  and its row inset (BLOCKERS.md, "The swipe action's row inset"):
  - **Delete** (`chat-history-row-<id>-delete`): fill `#FE4346`, white trash glyph, caption
    "Delete";
  - **Pin** (`chat-history-row-<id>-pin`): fill `#525252`, white pin glyph, caption "Pin", or
    **"Unpin"** on a pinned row *(designed)*.
  A full swipe does not trigger either.
- **Long-press** (#74): the phase-4 `ActionMenu` (`chat-history-menu`), anchored on the row, with
  **Pin** (`chat-history-menu-pin`, pin glyph, or "Unpin") and then **Delete**
  (`chat-history-menu-delete`, trash glyph, destructive `#FE4346`).
- **Pin / Unpin**: `PATCH /chats/{id} { pinned }`. The change is optimistic, and the row moves into
  or out of "Pinned" with a layout animation. On failure it reverts, with the toast **"Couldn’t
  update the chat. Try again."** *(designed)*.
- **Delete**: `DELETE /chats/{id}`. The row goes at once, and the toast **"Chat deleted"** follows
  *(designed)*. There is no confirmation and no Undo: #73 and #74 offered none, and a chat is cheap
  to re-ask. On failure the row comes back, with the toast **"Couldn’t delete the chat. Try
  again."**. Deleting the thread that is open behind the sheet also resets that screen to its empty
  state.
- **States**:
  - loading: a centred spinner (`chat-history-loading`);
  - **empty** *(designed, after #50's empty drawer)*, when there are no threads and no query:
    `chat-history-empty` shows serif 28pt **"No chats yet"** and, 8pt under it, 17pt `#A8AAA1`
    **"Your conversations with Notes will appear here."**, both centred;
  - **no results** *(designed, after #63)*, when a query matches nothing: `chat-history-no-results`
    shows **"No results"** in 20pt semibold and, under it, **"for “<q>”"** in 17pt `#A8AAA1`;
  - error: **"Couldn’t load your chats."** + a Retry pill (`chat-history-retry`), in
    `chat-history-error`.
- **Paging**: 30 rows a page, with the next page fetched on `onEndReached` (keyset, §6.1).

### 3.6 Model menu (`chat-model-menu`, #22)

A pull-up menu anchored above the model pill: 250pt wide, fill `#1E1E1E`, radius 28, 1pt `#333`
border, drawn with the phase-4 `ActionMenu` (inline, per BLOCKERS.md "The note page's More menu is
drawn inline"). Each item `chat-model-<modelId>` is 50pt (two-line labels wrap to 66pt) and has a
22pt family glyph at x 24, a 20pt label, and a check at x 12 on the selected item (#22). A
**disabled** model is drawn at 40% opacity and cannot be tapped (#22's greyed item). Items come from
`GET /chat/models` in server order, which puts **Auto (default)** last (#22). Picking one:

1. closes the menu;
2. updates `chat-model-label` at once;
3. calls `PUT /chat/model`, and on failure reverts with the toast **"Couldn’t change the model. Try
   again."** *(designed)*.

The selection is **per user**, so it holds across threads, scopes and relaunches. Every message
sent afterwards records it.

The fake list (§6.6) uses neutral names, never a real vendor's model names. The app has no
vendors, and a real name on a fake would claim an integration that does not exist.

### 3.7 Entry points (changes to earlier screens)

- **Home** `home-ask-button` (phase 2) opens `app/ask/index.tsx`. Its a11y label becomes **"Chat
  with Notes"** (already set).
- **Note page** `note-ask-button` (phase 4) pushes `app/ask/note/<id>`.
- **Attendees sheet** (#16): each `attendees-row-<attendeeId>` becomes pressable (pressed fill
  `#333333`). A tap dismisses the sheet and pushes
  `app/ask/person/<personKey>?name=<display name>`. The key is `personKeyOf(attendee)` from
  `@kn/domain/Domain/Person` (§6.2). This is a **designed interim entry**: phase 8 repoints the row
  to the person page (#65) and puts person Ask behind that page's pill, as #66 shows. The comment
  in `attendees.tsx` saying rows are not pressable is updated.

---

## 4. Copy

Every string is verbatim from COPY.md, with the reference app's name replaced by Notes, or marked *(designed)*.

| Where | String |
| --- | --- |
| Greeting (global, #70) | Hi <firstName>, ask anything · *(designed, no name)* Ask anything |
| Placeholders | Ask anything · Who did I meet with? · Summarize my meetings this week |
| Global chips | Who have I promised to follow up with? · What needs my attention first? · Catch me up on what's important · What are the top customer issues? |
| Scoped chips | List action items · Write follow-up email · List Q&A |
| Composer a11y | Add attachment · Chat model: <label> · Hold to dictate · Send |
| Nav a11y | Close · Back · New chat · Chat history |
| Model menu (fake list, §6.6) | Swift Thinking · Swift · Balanced Thinking · Balanced · Compact · Classic · Wide Context · Premium (disabled) · Auto (default); the pill shows "Auto" for Auto (default) |
| History | Chat History · Pinned *(designed)* · Today *(designed)* · Yesterday *(designed)* · Previous 7 days *(designed)* · Older · Search · Delete · Pin · Unpin *(designed)* · A11y: Close chat history |
| History empty *(designed)* | No chats yet · Your conversations with Notes will appear here. |
| History no results *(designed, from #63)* | No results · for “<q>” |
| History error *(designed)* | Couldn’t load your chats. · Retry |
| Activity row | Loaded notes · *(designed)* Searching notes... · *(designed)* Searched notes · A11y "<label>, <k> tools: <names>", tool names **List meetings**, **Read meetings** |
| Activity sheet | Activity · 1 note result · <n> note results · Opened 1 meeting · Opened <n> meetings · Done · A11y: All tool activity complete · *(designed)* No note results |
| Streaming *(designed)* | Thinking... |
| Answer failed *(designed)* | Couldn’t answer that. · Retry |
| Answer actions a11y | Copy response · Send positive feedback · Send negative feedback |
| Citation chip a11y *(designed)* | Source <k>: <note title> |
| Preview *(designed)* | This note is no longer available. · Couldn’t load the note. · Retry |
| Thread load *(designed)* | Couldn’t load this chat. · Retry · This chat no longer exists. |
| Toasts | Copied to clipboard (phase 4) · *(designed)* Attachments aren’t available yet. · Dictation isn’t available yet. · Chat deleted · Couldn’t delete the chat. Try again. · Couldn’t update the chat. Try again. · Couldn’t change the model. Try again. · Couldn’t save feedback. Try again. |
| Fake answers *(designed, §6.6)* | Here’s what I found in your notes: · From **<title>**: · I couldn’t find anything in your notes about that. |

The native strings live in `apps/native/src/features/chat/copy.ts`. The chips, the placeholder
lists and the model list's shape live in `packages/domain/src/Domain/Chat.ts` (`GLOBAL_CHIPS`,
`SCOPED_CHIPS`, `GLOBAL_PLACEHOLDERS`, `SCOPED_PLACEHOLDER`), so the fake, the tests and the app
all read one constant.

---

## 5. testIDs

| Screen | testIDs |
| --- | --- |
| Chat screen | `chat-screen`, `chat-close`, `chat-back`, `chat-title`, `chat-history-button`, `chat-new-button`, `chat-greeting`, `chat-chips`, `chat-chip-<i>`, `chat-thread`, `chat-user-<n>`, `chat-answer-<n>`, `chat-answer-<n>-activity`, `chat-answer-<n>-status`, `chat-answer-<n>-retry`, `chat-answer-<n>-body`, `chat-answer-<n>-block-<i>`, `chat-answer-<n>-cite-<k>`, `chat-answer-<n>-actions`, `chat-answer-<n>-copy`, `chat-answer-<n>-up`, `chat-answer-<n>-down`, `chat-loading`, `chat-error`, `chat-error-retry` |
| Composer | `chat-input-bar`, `chat-input`, `chat-attach`, `chat-model-button`, `chat-model-label`, `chat-send` |
| Model menu | `chat-model-menu`, `chat-model-<modelId>` (e.g. `chat-model-auto`, `chat-model-balanced`, `chat-model-premium`) |
| Activity sheet | `chat-activity-sheet`, `chat-activity-close`, `chat-activity-step-<i>`, `chat-activity-step-<i>-note-<noteId>` |
| Note preview | `citation-sheet`, `citation-close`, `citation-title`, `citation-meta-pill`, `citation-body`, `citation-block-<i>`, `citation-loading`, `citation-unavailable`, `citation-retry` |
| History sheet | `chat-history-sheet`, `chat-history-close`, `chat-history-search`, `chat-history-search-clear`, `chat-history-section-<pinned\|today\|yesterday\|week\|older>`, `chat-history-row-<threadId>`, `chat-history-row-<id>-title`, `chat-history-row-<id>-preview`, `chat-history-row-<id>-delete`, `chat-history-row-<id>-pin`, `chat-history-menu`, `chat-history-menu-pin`, `chat-history-menu-delete`, `chat-history-loading`, `chat-history-empty`, `chat-history-no-results`, `chat-history-error`, `chat-history-retry` |
| Earlier screens (now wired) | `home-ask-button`, `note-ask-button`, `attendees-row-<attendeeId>` |
| Toast | `toast`, `toast-message` |

`<n>` is the turn's position in the thread (0-based). `<k>` is the citation number as shown (1-based).
The same `<k>` repeated in one answer gives several chips with one id, and Maestro taps the first.

---

## 6. API

Every route is authenticated and owner-scoped. Another user's thread, message or note is a
**404**, identical to an absent one (D018). Timestamps are epoch ms (D003). The routes live in
`packages/domain/src/Chats/Contract.ts`.

### 6.1 Endpoints

| Route | Body / query | Success | Errors |
| --- | --- | --- | --- |
| `GET /chat/models` — `listChatModelsRoute` | — | 200 `{ models: ChatModel[], selected: ChatModelId }` | — |
| `PUT /chat/model` — `putChatModelRoute` | `{ model: ChatModelId }` | 200 the same shape | 422 `ChatModelUnavailable` (unknown or disabled) |
| `POST /chats` — `createChatRoute` | `{ scope: ChatScopeInput, content: ChatMessageContent }` | 200 `text/event-stream` (§6.4); the thread is created by this call | 404 `NoteNotFound` (note scope: absent, somebody else's or trashed), 404 `PersonNotFound` (no note of the caller has that attendee), 422 on the body |
| `POST /chats/{id}/messages` — `sendChatMessageRoute` | `{ content }` | 200 `text/event-stream` | 404 `ChatNotFound`, 409 `ChatBusy` (an answer in this thread is still `streaming`) |
| `POST /chats/{id}/messages/{messageId}/retry` — `retryChatMessageRoute` | — | 200 `text/event-stream`, streamed into the same assistant message | 404 `ChatNotFound` / `ChatMessageNotFound`, 409 `ChatMessageNotRetryable` (not an assistant message, or not `failed`) |
| `GET /chats` — `listChatsRoute` | `?q=&cursor=&limit=` (`PageQuery`; `q` trimmed, 1–100 chars) | 200 `Page<ChatThreadSummary>`, pinned first, then `updatedAt` desc, `id` desc | 422 on the query |
| `GET /chats/{id}` — `getChatRoute` | — | 200 `ChatThread` with its messages in order (at most `CHAT_THREAD_MAX_MESSAGES` = 200) | 404 `ChatNotFound` |
| `PATCH /chats/{id}` — `patchChatRoute` | `{ pinned: boolean }` (strict) | 200 `ChatThreadSummary` | 404 |
| `DELETE /chats/{id}` — `deleteChatRoute` | — | 204. A hard delete that cascades the messages | 404 |
| `PUT /chats/{id}/messages/{messageId}/feedback` — `putChatFeedbackRoute` | `{ feedback: "up" \| "down" \| null }` | 200 `ChatMessage` | 404; 409 `ChatMessageNotRetryable` is **not** used here. Feedback on a user message is a 422 `FeedbackNotAllowed` |

The contract describes each streaming route's 200 as `text/event-stream` with a string body, and it
names the event schemas under `components` so the client parser is typed from them.

**Search (`q`).** Case-insensitive substring match on the thread title **or** on any of its
messages' content. `%`, `_` and `\` are escaped (`like … escape '\'`). The same order and cursor
apply as without `q`.

**Cursor.** It is opaque, and encodes `(pinned ? 1 : 0, updatedAt, id)` of the last row. The next
page is `(pinned, updatedAt, id) < cursor` in that order. A cursor from another query shape is a
422, as in phase 4's `Cursor.ts`.

### 6.2 Shapes (`packages/domain/src/Domain/Chat.ts`, `Domain/Person.ts`)

```ts
ChatThreadId  = branded("ChatThreadId", "cht_")
ChatMessageId = branded("ChatMessageId", "msg_")

// Person.ts. Phase 8 builds the person page on the same key.
PersonKey = z.string().min(3).max(260).regex(/^(email|name):.+$/)
personKeyOf({ email, name }): PersonKey
  // "email:" + trimmed lowercased email when there is one, else "name:" + trimmed, lowercased,
  // whitespace-collapsed name.

ChatScopeInput = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("global") }),
  z.strictObject({ kind: z.literal("note"), noteId: NoteId }),
  z.strictObject({ kind: z.literal("person"), personKey: PersonKey }),
])
// The read shape adds the label the nav row shows.
ChatScope = ChatScopeInput & { label: string | null }
  // global → null. note → the note's current title (joined at read time), or null once it is
  // trashed. person → the name stored when the thread was created.

ChatModelId = z.enum(["swift-thinking", "swift", "balanced-thinking", "balanced", "compact",
                      "classic", "wide-context", "premium", "auto"])
ChatModel = z.object({
  enabled: z.boolean(),
  family: z.enum(["swift", "balanced", "classic", "premium", "auto"]),   // picks the glyph
  id: ChatModelId,
  label: z.string(),        // "Auto (default)", "Balanced Thinking"
  shortLabel: z.string(),   // for the pill: "Auto", "Balanced Thinking"
})
DEFAULT_CHAT_MODEL = "auto"

CHAT_MESSAGE_MAX = 4_000
ChatMessageContent = z.string().trim().min(1).max(CHAT_MESSAGE_MAX)

Citation = z.object({
  index: z.number().int().min(1),      // the [k] in the content
  noteId: NoteId,
  startedAt: Timestamp,
  title: z.string(),                   // a snapshot at answer time; the preview reads the live note
})
ActivityNote = z.object({ noteId: NoteId, title: z.string() })
ActivityStep = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("search"), notes: z.array(ActivityNote) }),  // "List meetings"
  z.object({ kind: z.literal("open"), notes: z.array(ActivityNote) }),    // "Read meetings"
  z.object({ kind: z.literal("done") }),
])
ChatMessageStatus = z.enum(["streaming", "complete", "failed"])
ChatMessage = z.object({
  activity: z.array(ActivityStep),     // [] for a user message
  citations: z.array(Citation),        // [] for a user message
  content: z.string(),                 // markdown with [k] markers; "" while streaming
  createdAt: Timestamp,
  feedback: z.enum(["up", "down"]).nullable(),
  id: ChatMessageId,
  model: ChatModelId.nullable(),       // the model the user had selected; null for a user message
  role: z.enum(["user", "assistant"]),
  status: ChatMessageStatus,           // user messages are always complete
})
ChatThreadSummary = z.object({
  id: ChatThreadId,
  pinned: z.boolean(),
  preview: z.string(),                 // the last complete assistant message's content, newlines
                                       // collapsed, cut to 160 chars; "" if none
  scope: ChatScope,
  title: z.string(),
  updatedAt: Timestamp,                // the last message's createdAt
})
ChatThread = ChatThreadSummary & { messages: z.array(ChatMessage) }

// A `streaming` message older than this reads as `failed` (derived at read time; there is no sweep).
CHAT_STREAM_STALE_AFTER_MS = 2 * 60_000

GLOBAL_CHIPS, SCOPED_CHIPS, GLOBAL_PLACEHOLDERS, SCOPED_PLACEHOLDER    // §4, verbatim
CHAT_TITLE_MAX = 60
```

**Errors** (`packages/domain/src/Chats/Errors.ts`, R7): `ChatNotFound` 404,
`ChatMessageNotFound` 404, `PersonNotFound` 404, `ChatBusy` 409, `ChatMessageNotRetryable` 409,
`ChatModelUnavailable` 422, `FeedbackNotAllowed` 422. The existing `NoteNotFound` 404 is reused
for the note scope. Each gets a case in `apps/api/src/on-error.ts`.

### 6.3 Storage (`packages/db`)

- **`chat_threads`**, keys alphabetical:
  - `created_at`;
  - `id` pk (`cht_`);
  - `owner_id` → `user.id`, on delete cascade;
  - `pinned_at` int null;
  - `scope_kind` text not null (`global | note | person`);
  - `scope_note_id` text null → `notes.id`, on delete cascade;
  - `scope_person_key` text null;
  - `scope_person_name` text null;
  - `title` text not null;
  - `updated_at`.

  A check makes the scope columns agree with `scope_kind`: a note thread has `scope_note_id` and
  the person columns null, a person thread has both person columns and `scope_note_id` null, and a
  global thread has all three null. Index `chat_threads_owner_order_idx` on (`owner_id`,
  `pinned_at`, `updated_at` desc, `id` desc).
- **`chat_messages`**, keys alphabetical:
  - `activity` text not null default `'[]'` (JSON);
  - `citations` text not null default `'[]'` (JSON);
  - `content` text not null default `''`;
  - `created_at`;
  - `failure` text null;
  - `feedback` text null;
  - `id` pk (`msg_`);
  - `model` text null;
  - `owner_id` → `user.id` cascade (denormalised, so every read and write filters on it without a
    join);
  - `position` int not null;
  - `role` text not null;
  - `status` text not null;
  - `thread_id` → `chat_threads.id`, on delete cascade;
  - `updated_at`.

  Unique (`thread_id`, `position`). A partial index on (`thread_id`) where `status = 'streaming'`
  backs the `ChatBusy` check. The repository parses the JSON columns through the domain schemas at
  the boundary (R2). A row that fails to parse is read as `[]`, never thrown on.
- **`chat_preferences`**: `model` text not null, `updated_at`, `user_id` pk → `user.id` cascade.
  An absent row means `DEFAULT_CHAT_MODEL`, so a read never writes (the same reasoning as a
  missing profile setting).
- `RESET_ORDER` gains `chatMessages`, then `chatThreads`, before `noteGenerations`. It gains
  `chatPreferences` before `profiles`.
- The migration comes from `db:generate` (`0006_chats.sql`).
- **The seed** (`E2E/Fixtures.ts`, `E2E_CHATS`), with fixed ids and absolute instants, as in the
  phase-4 fixture rule:

  | id | owner | scope | title | updatedAt | pinned | messages |
  | --- | --- | --- | --- | --- | --- | --- |
  | `cht_e2e_cohort` | person | global | Beta cohort size | 2026-09-12 14:00 UTC | no | user "How many teams are in the beta cohort?"; assistant complete: "The beta cohort is **forty teams** across three regions [1]." It cites 1 → `not_e2e_launch`. Activity: search [launch], open [launch], done. Model `auto` |
  | `cht_e2e_solo` | person | note `not_e2e_solo` | Solo note recap | 2026-08-05 12:00 UTC | no | user "What did I say?"; assistant complete: "You only recorded a brief greeting, with no decisions or follow-ups [1]." It cites 1 → `not_e2e_solo`. Activity: open [solo], done |
  | `cht_e2e_other` | other | global | Other person’s chat | 2026-09-12 09:00 UTC | no | user "Secret question"; assistant "Nobody but other should read this." |

  Both of `person`'s threads fall in **Older** on any date after 2026-09-19, which covers every run
  from now on. The flows assert them there, which is also what #24 shows.
  `usr_e2e_person` has no `chat_preferences` row, so the model is Auto.

### 6.4 Asking: the service and the stream

`ChatsService` (`packages/server/src/Chats/ChatsService.ts`) takes `{ clock, ids, repo, llm,
logger }` as deps (R3). Every method takes the `Actor`, and ownership goes through
`Chats/Policy.ts` (R4).

**`ask(actor, { threadId | scope, content })` → `AsyncIterable<ChatEvent>`**. The handler (R6)
is one expression: `streamSSE(c, (s) => pipe(svc.chats.ask(actor, input), s))`, using Hono's
`streamSSE`. The service never sees Hono. Its steps:

1. **Resolve the scope.**
   - A new thread with scope `note`: `repo.liveNoteForOwner(ownerId, noteId)`, or `NoteNotFound`.
   - Scope `person`: `repo.personForOwner(ownerId, personKey)`, which finds the person among the
     caller's live notes' attendees, including the caller's own row, whose email comes from `user`,
     or raises `PersonNotFound`. It returns the most recent display name.
   - An existing thread: `repo.threadForOwner`, or `ChatNotFound`. If an answer in it is still
     `streaming` and not stale, raise `ChatBusy`.

   All of this is checked **before the stream opens**, so these are ordinary JSON error responses,
   not error events.
2. **Write the turn.** One batch writes:
   - the thread, if new, with the title `llm.titleChat({ question })`;
   - the user message (`complete`);
   - the assistant message (`streaming`, `model` = the caller's preference);
   - the thread's `updated_at` = now.

   Then it yields
   `turn { threadId, thread: ChatThreadSummary, userMessage: ChatMessage, assistantMessageId }`.
3. **Retrieve** (`repo.retrieve(ownerId, scope, terms, limit)`), in SQL over `notes` where
   `owner_id = ? and trashed_at is null`. Note scope adds `and id = ?`. Person scope adds
   `and exists (attendee row matching the key)`. It returns `{ noteId, title, startedAt,
   bodyMarkdown, transcriptText }[]`. The service's rule is `searchTerms(question)` (pure): the
   lowercased words of 3 or more letters, minus a fixed stopword list, at most 12 of them. Scoring
   is also in the service, as a pure `scoreNote(note, terms)`: two points per distinct term in the
   title and one per distinct term in the body or transcript. The top `CHAT_RETRIEVE_LIMIT` = 5
   with a score above 0 are kept, ties broken by `startedAt` desc. **When nothing scores**, global
   and person scope fall back to the 3 most recent notes in scope. General questions ("Catch me up
   on what's important") are about recent meetings, and a keyword miss must not read as "you have
   no notes". Note scope always yields its one note.
   - It then yields `activity` with `[search(notes), open(notes), …]`. Note scope has no `search`
     step, since it opened the note it was given (#25 lists both tools for a global question).
   - Then it yields `citations` with the retrieved notes numbered 1..k in retrieval order. They
     come **before** the first token, so a chip can render the moment its marker arrives.
   - Zero notes (a caller with no live notes in scope) gives `activity [search([]), done]`,
     `citations []`, and the LLM is still called with no context. The fake then answers with the
     "couldn’t find" line.
4. **Answer.** `for await (const delta of llm.streamAnswer({ key: assistantMessageId + ":" +
   attempt, question, scope, model, notes: retrieved.map(toContext), history: last 10 messages }))`
   yields `token { text: delta }`. The deltas are also accumulated in memory.
5. **Finish.** `repo.completeAnswer(ownerId, messageId, { content, citations, activity:
   [...steps, done] })` runs `where status = 'streaming'`, which is the latch. It filters the
   citations down to the indices the content actually uses, and bumps the thread's `updated_at`.
   Then it yields `done { message: ChatMessage, thread: ChatThreadSummary }`.
6. **Failure.** Any `Llm*` error, or an error of ours after step 2, runs
   `repo.failAnswer(ownerId, messageId, failure)` (again `where status = 'streaming'`) and yields
   `error { code, message }`, where `message` is the error's public text and never a stack. The
   stream then ends. A database error before step 2 is thrown, and `on-error.ts` renders it as
   usual.

**A client that disconnects** does not stop the generator: `streamSSE`'s writes fail silently
after an abort, and the service runs to step 5 or 6, so the answer is stored. If the isolate dies
mid-answer, the row stays `streaming`. Reads treat a row older than `CHAT_STREAM_STALE_AFTER_MS` as
`failed` (the repo maps it), and `ChatBusy` ignores a stale row. That makes Retry the recovery,
and no sweep is needed.

**`retry(actor, threadId, messageId)`** claims the row with
`update … set status='streaming', content='', citations='[]', activity='[]', failure=null where
id=? and owner_id=? and role='assistant' and (status='failed' or (status='streaming' and
updated_at < now − STALE))`. No row raises `ChatMessageNotRetryable`. It then runs steps 3–6 for
the user message before it, with `attempt` + 1.

**Events** (`packages/domain/src/Chats/Events.ts`, a zod discriminated union on `event`):

```
event: turn       data: { threadId, thread, userMessage, assistantMessageId }   (not on retry)
event: activity   data: { steps: ActivityStep[] }        — the whole list, replaced, not appended
event: citations  data: { citations: Citation[] }
event: token      data: { text: string }
event: done       data: { message: ChatMessage, thread: ChatThreadSummary }
event: error      data: { code: string, message: string }
```

A stream always ends with exactly one `done` or `error`, and the order is fixed: `turn`, then
`activity`, then `citations`, then any number of `token`, then `done` or `error`.

**Other methods:** `list(actor, { q, cursor, limit })`, `get(actor, id)`, `pin(actor, id,
pinned)` (`pinned_at` = now or null; `updated_at` does **not** move, so pinning does not reorder
Today/Older), `remove(actor, id)`, `feedback(actor, threadId, messageId, value)`, `models(actor)`
and `selectModel(actor, model)`. The model list is a constant in the service
(`CHAT_MODELS`); `premium` is `enabled: false`.

### 6.5 The LLM port (`Integrations/Llm/Port.ts`, extended)

```ts
type ChatContextNote = {
  readonly index: number;            // the citation number the model must use as [index]
  readonly title: string;
  readonly startedAt: Timestamp;
  readonly bodyMarkdown: string;
  readonly transcriptText: string;   // "" when there is no recording
};
type ChatAnswerRequest = {
  readonly key: string;              // "<assistantMessageId>:<attempt>"
  readonly question: string;
  readonly scope: "global" | "note" | "person";
  readonly model: ChatModelId;
  readonly notes: readonly ChatContextNote[];
  readonly history: readonly { role: "user" | "assistant"; content: string }[];
  readonly timeoutMs: number;        // CHAT_LLM_TIMEOUT_MS = 60_000
};
LlmPort += {
  streamAnswer(request: ChatAnswerRequest): AsyncIterable<string>;   // deltas; throws Llm* errors
  titleChat(request: { question: string }): Promise<string>;
};
```

The existing error classes (`LlmUnavailable`, `LlmRateLimited`, `LlmRejected`, `LlmTimeout`) are
reused. The chat path does not retry on its own. Every failure goes to the user as the failed
state, and they choose whether to retry.

### 6.6 `LlmFake`, chat half (deterministic)

The fake gets two new deps, both injected by `container.ts` (R3):

- `sleep(ms): Promise<void>`: real timers in the container, and an instant resolve in tests;
- `readChatMode(): Promise<"auto" | "hold" | "fail">`: `e2e_switches.chat` with the harness armed,
  and `async () => "auto"` otherwise.

It also gets `tokenDelayMs`: 25 in the container, 0 in tests. It records `chatCalls`.

- **`titleChat`**: the question trimmed, with trailing `?`, `.` and `!` removed and the first
  letter uppercased, cut to `CHAT_TITLE_MAX` at the last word boundary. "Who have I promised to
  follow up with?" becomes **"Who have I promised to follow up with"**.
- **`streamAnswer`, `auto`**, with the body built first and then emitted **one word (with its
  trailing space) per delta**, `tokenDelayMs` apart:
  - no notes: **"I couldn’t find anything in your notes about that."**;
  - note scope: **"From **<title>**:"**, a blank line, then up to 3 bullets `- <line> [1]`;
  - global and person scope: **"Here’s what I found in your notes:"**, a blank line, then one
    bullet per note, `- **<title>** — <line> [<index>]`.

  `<line>` is the note's best line: the markdown lines of `bodyMarkdown` (then of the transcript),
  stripped of `#`, `-`, `**` and `_`, scored by how many of the question's terms they contain.
  Ties go to document order, and all-zero takes the first non-heading lines. The line is cut to
  140 chars at a word boundary. The same request always gives the same text.
- **`hold`**: before the first delta, it polls `readChatMode()` every 250 ms through `sleep`
  until the mode is not `hold`, then continues as that mode. After `CHAT_LLM_TIMEOUT_MS` it throws
  `LlmTimeout`. This is how a flow holds "Thinking...".
- **`fail`**: it throws `LlmUnavailable` before the first delta.

For the seeded `person`, the chip "Who have I promised to follow up with?" scores nothing (no
seeded line contains "promised" or "follow"), so it falls back to the 3 most recent notes:
`not_e2e_launch` [1], `not_e2e_standup` [2] and `not_e2e_solo` [3]. The question "What did we
decide about pricing?" scores `not_e2e_launch` alone ("pricing" occurs twice in its body), so the
answer has one bullet, `**Launch planning review** — Pricing page copy still needs legal review
[1]`. §8 relies on both, and `Chats.test.ts` pins them.

**Config (R5).** Nothing new is parsed: chat uses the same `LLM_MODE` as phase 6, and `live` is
still refused. `container.ts` passes `sleep`, `tokenDelayMs` and `readChatMode`.

**E2E harness** (plain Hono, behind `E2E_HARNESS`):

- `POST /e2e/chat` `{ mode: "auto" | "hold" | "fail" }` answers 200 `{ mode }`, and 422 on
  anything else;
- `POST /e2e/chat/release` sets `auto` and answers 200. A held stream sees it on its next poll;
- `POST /e2e/reset` clears the `chat` switch, and `POST /e2e/seed` writes `E2E_CHATS`.

---

## 7. API test cases

`Chats/Chats.test.ts` covers the service over `makeTestD1()`, `fixedClock`, `sequentialIds`,
`LlmFake` (instant `sleep`, `tokenDelayMs` 0) and the real `NotesRepo`/`NotesService` to create
notes. Streams are collected with a helper `collect(iterable)`.

1. **Global ask, happy path.** On a new thread the events come in the order `turn, activity,
   citations, token+, done`. `done.message.status` is `complete`, and its content equals the
   concatenated tokens. `thread.title` equals `titleChat(question)`. `GET` returns two messages,
   and the thread's `updatedAt` = now.
2. **Scoring.** For "What did we decide about pricing?" over the seeded `person` notes, the one
   citation is `not_e2e_launch`, and the answer is the pinned §6.6 text.
3. **Fallback.** "Who have I promised to follow up with?" cites launch, standup and solo, in that
   order.
4. **Note scope.** A note-scoped ask cites only that note, even when another note scores higher.
   The activity has no `search` step.
5. **Person scope.** Asking about `email:priya@example.com` cites only notes with Priya as an
   attendee (launch). A person key matching no attendee raises `PersonNotFound` before any write.
   The caller's own key (`email:e2e-person@kothanote.test`) covers all their notes.
6. **Retrieval never crosses users** (the phase exit criterion):
   - `other`'s note contains the unique word "zebracorn". `person` asking "zebracorn" gets no
     citation for it (the fallback cites only `person`'s notes), and the fake's
     `chatCalls[0].notes` holds no note of `other`'s;
   - a note-scoped ask on `other`'s note id raises `NoteNotFound`, with no thread written;
   - a person-scoped ask for a key that exists only among `other`'s attendees raises
     `PersonNotFound`;
   - `person` sending to `cht_e2e_other` raises `ChatNotFound`.
7. **Trashed notes are not retrieved.** A trashed note matching every term is never cited. A
   note-scoped ask on a trashed note raises `NoteNotFound`, and an existing thread whose note was
   later trashed answers with the "couldn’t find" text.
8. **No notes.** `empty` asks: `activity [search([]), done]`, `citations []`, and the content is
   the "couldn’t find" line.
9. **Citations filtered to use.** When the scripted answer uses only `[1]`, the stored citations
   are `[1]` only.
10. **Failure.** In `fail` mode the stream ends with `error`. The assistant row is `failed`, the
    user message is kept, and no `done` is sent.
11. **Retry.** `retry` on the failed message streams `activity, citations, token+, done` with no
    `turn`. The same message id ends `complete`. `retry` on a complete message, or on a user
    message, raises `ChatMessageNotRetryable`.
12. **Busy and stale.** With a `hold` stream open (not collected), a second send raises `ChatBusy`.
    Once the clock is advanced past `CHAT_STREAM_STALE_AFTER_MS`, `get` reads it as `failed`, a send
    is allowed, and `retry` claims it.
13. **Hold then release.** With `hold`, the stream yields `turn, activity, citations` and then
    waits. Once the switch is set to `auto`, it finishes `done`.
14. **Disconnect still stores.** A consumer that stops reading after `citations` (`return()` on
    the iterator) still leaves the message `complete`. The generator is run to completion by the
    service, not by the reader (the test drives it through the same `pipe` helper the handler
    uses).
15. **List order and cursor.** Pinned first, then `updatedAt` desc, then `id` desc. Paging with
    `limit 1` visits every thread once. Pinning does not change `updatedAt`.
16. **Search.** `q=cohort` returns only `cht_e2e_cohort`, `q=forty` (message content only) returns
    it too, `q=%` matches only literal percent signs (none), and `q=zzqx` returns an empty page.
    Another user's thread never matches.
17. **Pin, unpin, delete.** `pin` sets `pinned`, and unpinning clears it. `remove` deletes the
    thread and its messages, and a second `remove` raises `ChatNotFound`. Pin and remove on another
    user's thread raise `ChatNotFound` and change nothing.
18. **Feedback.** `up`, then `down`, then `null` round-trip. Feedback on a user message raises
    `FeedbackNotAllowed`. Feedback on another user's message raises `ChatMessageNotFound`.
19. **Models.** `models` returns the 9 models in the §3.6 order with `selected: "auto"` and no row
    written. `selectModel("balanced")` persists, and the next ask records `model: "balanced"` on the
    assistant message. `premium` and an unknown id raise `ChatModelUnavailable`.
20. **Validation.** Blank or whitespace-only content, and content over 4 000 chars, are refused
    with a 422 by the contract (in the http test). A `scope` with extra keys is refused.
21. **Cascades.** Deleting the user removes their threads, messages and preference. Deleting a
    thread removes its messages.
22. **Pure units** (`Chats/Retrieval.test.ts`):
    - `searchTerms` (stopwords, length, cap);
    - `scoreNote` (title weight, distinct terms);
    - `personKeyOf` (email lowercased, name normalised, email preferred);
    - `titleChat` in the fake (punctuation, word-boundary cut);
    - the fake's best-line picker.

Other suites:

- `Chats/Chats.http.test.ts`: one test per route for the wire shape. It asserts that a stream
  answers `content-type: text/event-stream`, that its frames parse through `ChatEvent`, and that it
  ends with `done`. It also covers 401 without a session, 404 on another user's thread, 409
  `ChatBusy`, 422 on a bad body, and 204 on delete.
- `packages/apiclient/src/chatStream.test.ts`: the SSE parser. It handles a frame split across
  chunks, CRLF, a multi-line `data:`, an unknown event (ignored), and a stream that ends without
  `done` (surfaced as an `error` event with `code: "stream_ended"`).
- `Integrations/Llm/Llm.test.ts`, extended: the chat fake is deterministic, delivers one word per
  delta, and honours `hold` (release through a scripted `readChatMode`), `fail` and the no-notes
  line. It records `chatCalls`.
- `E2E/E2E.test.ts`: the seed writes the three threads; `POST /e2e/chat` sets the switch and
  rejects a bad mode; reset clears it and removes every thread.
- `apps/api` `app.test.ts`: every new route is mounted and appears in the OpenAPI document under
  the `Chats` tag. `on-error.ts` maps every new error.

---

## 8. Acceptance criteria and flows

Every flow starts from `clearState` + `clearKeychain` + reset/seed, and signs in fast through
`subflows/open-home.yaml` (as `person`, unless it says otherwise). Tags: `phase-7`,
`regression`. Flows select by `id`. Text is asserted only as a property of an id, and an id regex
(`"chat-answer-0-block-\d+"`) stands in wherever the block index depends on the fake's output.

New Maestro pieces:

- `scripts/e2e-chat.js` (`MODE`) and `scripts/e2e-chat-release.js`, which call the §6.6 harness
  routes;
- `subflows/set-chat.yaml` (`MODE`) and `subflows/release-chat.yaml`;
- `subflows/open-global-chat.yaml`: taps `home-ask-button` and waits for `chat-screen` and
  `chat-input`;
- `subflows/open-history.yaml`: taps `chat-history-button` and waits for `chat-history-sheet`,
  then for `chat-history-loading` to go;
- `subflows/wait-for-answer.yaml` (`N`): waits up to 30 s for `chat-answer-${N}-actions`, which
  appears only once `done` has arrived.

| # | Given / When / Then | Flow |
| --- | --- | --- |
| AC1 | **Given** the seeded `person` on home, **when** they tap `home-ask-button`, **then** `chat-screen` shows `chat-close`, `chat-history-button` and no `chat-new-button`; `chat-greeting` reads "Hi E2E, ask anything"; `chat-chip-0`..`chat-chip-3` read the four global chips in order; and `chat-send` has the label "Hold to dictate". **When** they type "What did we decide about pricing?" into `chat-input`, **then** `chat-send` reads "Send". **When** they tap it, **then** `chat-user-0` reads the question, the chips are gone, and after `wait-for-answer` (N 0): `chat-answer-0-activity` reads "Loaded notes"; `chat-answer-0-block-0` reads "Here’s what I found in your notes:"; a `chat-answer-0-block-\d+` contains "Launch planning review"; `chat-answer-0-cite-1` is visible; `chat-title` reads "What did we decide about pricing"; and `chat-new-button` is visible. **When** they tap `chat-close`, **then** `home-screen` is visible. | `apps/native/.maestro/phase-7/ask-global.yaml` |
| AC2 | **Given** the global chat is open, **when** they tap `chat-chip-0`, **then** `chat-user-0` reads "Who have I promised to follow up with?" with no typing. After the answer, `chat-answer-0-cite-1`, `-cite-2` and `-cite-3` are visible (the fallback, §6.6) and `chat-title` reads "Who have I promised to follow up with". | `apps/native/.maestro/phase-7/ask-chip.yaml` |
| AC3 | **Given** the seeded `not_e2e_launch` is open, **when** they tap `note-ask-button`, **then** `chat-screen` shows `chat-back`, `chat-title` reads "Launch planning review", there is no `chat-greeting`, and `chat-chip-0`..`2` read "List action items", "Write follow-up email", "List Q&A" (and there is no `chat-chip-3`). **When** they tap `chat-chip-0`, **then** after the answer `chat-answer-0-block-0` reads "From Launch planning review:", `chat-answer-0-cite-1` is visible, and no `chat-answer-0-cite-2` exists. **When** they tap `chat-back`, **then** `note-screen` is visible. | `apps/native/.maestro/phase-7/ask-note.yaml` |
| AC4 | **Given** `not_e2e_launch` is open, **when** they tap `note-meta-pill` and then `attendees-row-att_e2e_launch_1` (Priya Raman), **then** the sheet closes and `chat-screen` shows `chat-back`, with `chat-title` reading "Priya Raman", no `chat-greeting`, and the three scoped chips. **When** they send "What did Priya work on?", **then** after the answer `chat-answer-0-cite-1` is visible and no `-cite-2` exists (only launch has Priya). **When** they tap `chat-answer-0-cite-1`, **then** `citation-title` reads "Launch planning review". | `apps/native/.maestro/phase-7/ask-person.yaml` |
| AC5 | **Given** the global chat is open, **when** they open history and tap `chat-history-row-cht_e2e_cohort`, **then** the sheet closes, `chat-title` reads "Beta cohort size", `chat-user-0` reads "How many teams are in the beta cohort?", and `chat-answer-0-block-0` contains "forty teams". **When** they tap `chat-answer-0-cite-1`, **then** `citation-sheet` shows `citation-title` "Launch planning review", `citation-meta-pill` is visible, and `citation-block-0` reads "Launch checklist". **When** they tap `citation-close` and then `chat-answer-0-activity`, **then** `chat-activity-sheet` shows `chat-activity-step-0` reading "1 note result", `-step-1` reading "Opened 1 meeting" and `-step-2` reading "Done". **When** they tap `chat-activity-step-0`, **then** `chat-activity-step-0-note-not_e2e_launch` appears. **When** they tap it, **then** `citation-title` reads "Launch planning review". | `apps/native/.maestro/phase-7/citation-preview.yaml` |
| AC6 | **Given** `cht_e2e_cohort` is open (as in AC5), **when** they send "Which regions?", **then** `chat-user-1` reads it and `chat-answer-1-actions` appears. **When** they tap `chat-new-button`, **then** `chat-greeting` and `chat-chip-0` are visible, `chat-thread` shows no `chat-user-0`, and `chat-new-button` is gone. **When** they open history, **then** `chat-history-row-cht_e2e_cohort-preview` contains "Here’s what I found" (the follow-up is now the last answer), and it is still in `chat-history-section-today` (its `updatedAt` moved to now). | `apps/native/.maestro/phase-7/thread-follow-up.yaml` |
| AC7 | **Given** history is open from the global chat, **then** `chat-history-section-older` holds `chat-history-row-cht_e2e_cohort` and `chat-history-row-cht_e2e_solo`, and no `chat-history-row-cht_e2e_other` exists. **When** they type "cohort" into `chat-history-search`, **then** only `cht_e2e_cohort` is visible. **When** they replace the query with "forty", **then** `cht_e2e_cohort` is still there (a content match). **When** they replace it with "zzqx", **then** `chat-history-no-results` is visible. **When** they tap `chat-history-search-clear`, **then** both rows return. | `apps/native/.maestro/phase-7/history-search.yaml` |
| AC8 | **Given** history is open, **when** they swipe `chat-history-row-cht_e2e_solo` left and tap `chat-history-row-cht_e2e_solo-pin`, **then** `chat-history-section-pinned` appears and holds `cht_e2e_solo`. **When** they close and reopen history, **then** it is still pinned. **When** they long-press it and tap `chat-history-menu-pin` (now "Unpin"), **then** `chat-history-section-pinned` is gone and the row is back under Older. | `apps/native/.maestro/phase-7/history-pin.yaml` |
| AC9 | **Given** history is open, **when** they long-press `chat-history-row-cht_e2e_cohort` and tap `chat-history-menu-delete`, **then** the row is gone and `toast-message` reads "Chat deleted". **When** they swipe `chat-history-row-cht_e2e_solo` left and tap its `-delete`, **then** `chat-history-empty` is visible. **When** they close the sheet, relaunch (`relaunch-app`), open the global chat and open history again, **then** `chat-history-empty` is still visible. | `apps/native/.maestro/phase-7/history-delete.yaml` |
| AC10 | **Given** the global chat is open, **when** they tap `chat-model-button`, **then** `chat-model-menu` lists `chat-model-swift-thinking` … `chat-model-auto`, and `chat-model-premium` is disabled (`enabled: false`). **When** they tap `chat-model-balanced`, **then** `chat-model-label` reads "Balanced". **When** they close the chat, relaunch and reopen it, **then** `chat-model-label` still reads "Balanced". | `apps/native/.maestro/phase-7/model-picker.yaml` |
| AC11 | **Given** the chat switch is in `hold` and the global chat is open, **when** they send "What did we decide about pricing?", **then** `chat-user-0` is visible, `chat-answer-0-status` reads "Thinking...", `chat-answer-0-activity` reads "Loaded notes", `chat-send` is disabled, and there is no `chat-answer-0-actions`. **When** the chat is released (`release-chat`), **then** the answer finishes, `chat-answer-0-status` is gone, and `chat-answer-0-actions` appears. | `apps/native/.maestro/phase-7/answer-streaming.yaml` |
| AC12 | **Given** the chat switch is in `fail`, **when** they send a question, **then** `chat-answer-0-status` reads "Couldn’t answer that." and `chat-answer-0-retry` is visible, with no actions. **When** the switch is set to `auto` and they tap Retry, **then** `chat-answer-0-actions` appears and `chat-answer-0-cite-1` is visible. There is still exactly one `chat-user-0`, and no `chat-user-1`. | `apps/native/.maestro/phase-7/answer-failed.yaml` |
| AC13 | **Given** the seeded `empty` user (`open-home-as`, ROLE empty) on home, **when** they open the global chat and open history, **then** `chat-history-empty` is visible. **When** they close it and tap `chat-chip-1`, **then** `chat-answer-0-activity` reads "Searched notes", `chat-answer-0-block-0` reads "I couldn’t find anything in your notes about that.", and no `chat-answer-0-cite-1` exists. | `apps/native/.maestro/phase-7/ask-no-notes.yaml` |
| AC14 | **Given** an answered global question (as in AC1), **when** they tap `chat-answer-0-up`, **then** it is selected (`selected: true`). **When** they tap `chat-answer-0-down`, **then** down is selected and up is not. **When** they reopen the thread from history, **then** down is still selected. **When** they tap `chat-answer-0-copy`, **then** `toast-message` reads "Copied to clipboard". **When** they tap `chat-attach`, **then** the toast reads "Attachments aren’t available yet.", and **when** they tap `chat-send` with an empty draft, **then** it reads "Dictation isn’t available yet.". | `apps/native/.maestro/phase-7/answer-actions.yaml` |

Every phase-2..6 flow must still pass. `phase-2/home-shell-inert.yaml` asserts that the Ask pill
does nothing. It is changed so it no longer taps `home-ask-button` (or so it asserts that
`chat-screen` opens and closes), and that edit is part of this phase.

Screenshots for the visual check (`TESTING.md` §8), each compared by eye with its discovery shot
before review:

| Screenshot | From flow | Compare with |
| --- | --- | --- |
| `phase-7-global-empty` | AC1 | #70 |
| `phase-7-note-empty` | AC3 | #19 |
| `phase-7-thread` | AC5 | #25 |
| `phase-7-activity` | AC5 | #26 |
| `phase-7-activity-expanded` | AC5 | #27 |
| `phase-7-citation` | AC5 | #28 |
| `phase-7-history` | AC7 | #24 |
| `phase-7-history-swipe` | AC8 | #73 |
| `phase-7-history-menu` | AC8 | #74 |
| `phase-7-model-menu` | AC10 | #22 |
| `phase-7-streaming` | AC11 | designed |

---

## 9. Designed states no flow reaches

- `chat-error` / `chat-error-retry` (a thread failing to load) and "This chat no longer exists.":
  these need `GET /chats/{id}` to fail on demand;
- the preview's `citation-unavailable` and `citation-retry`: `citation-unavailable` could be
  reached by trashing a cited note, but no flow does, and it is unit-tested through the pure state
  function;
- the failure toasts for pin, delete, the model and feedback: each needs a write to fail;
- the auto-scroll hold when the user has scrolled up: Maestro cannot measure it, so it is checked
  by eye;
- the `ChatBusy` 409 surfacing from the app: the send button is disabled while streaming, so the
  app cannot cause it;
- a stale `streaming` row read back as failed: it needs a killed isolate, and is unit-tested (§7
  case 12).

They belong to the same scripted-response harness seam that `BLOCKERS.md` defers for phases 3–6.
Stopping an answer mid-stream was never seen and is not built. The server would need a cancel
route, and the generator would need to check a stop flag between tokens.

---

## 10. Blockers to record

- **No live LLM for chat.** `streamAnswer` and `titleChat` exist only in `LlmFake`. A live client
  needs a prompt that emits `[k]` markers from the numbered context, a streaming transport, and a
  real model list behind the `ChatModelId` ids. The model list is fake by design (neutral names).
  Stubbed: the fake runs everywhere, under the phase-6 `LLM_MODE`.
- **Retrieval is keyword scoring, not semantic.** Good enough to prove scoping and ownership and to
  drive the UI. A real product would embed the notes. Recorded, and not built.
- **Person scope has an interim entry.** The attendees-sheet row opens it until phase 8's person
  page exists (§3.7).
- **Streaming on device relies on `expo/fetch`.** React Native's global `fetch` does not expose
  a response body stream on iOS, so the app reads the SSE body with `expo/fetch` (Expo 57). If it
  does not stream through a dev build, the stub is to read the whole body at `done` and render it
  at once. The UI's states are unchanged, and only the token-by-token growth is lost. Write it down
  if that happens.

---

## 11. Task split

### API (packages/domain, packages/server, packages/db, apps/api, packages/apiclient)

1. `packages/domain/src/Domain/Chat.ts`: the ids, scopes, models, messages, threads, citations,
   activity, constants, chips and placeholders. `Domain/Person.ts` (`PersonKey`, `personKeyOf`).
   `Domain/Chat.test.ts` and `Domain/Person.test.ts`.
2. `packages/domain/src/Chats/Errors.ts` (the seven errors), `Chats/Events.ts` (the SSE event
   union), and `Chats/Contract.ts` (the ten routes, with the streaming 200s described as
   `text/event-stream`).
3. `packages/db`:
   - the `chat_threads`, `chat_messages` and `chat_preferences` schemas with their check and
     indexes;
   - `db:generate` (`0006_chats.sql`);
   - `RESET_ORDER`.
4. `Integrations/Llm`: extend `Port.ts` with `streamAnswer` and `titleChat`. Extend `LlmFake.ts`
   (the answer templates, one word per delta, `hold`/`fail` through `readChatMode` and `sleep`,
   and `chatCalls`) and `Llm.test.ts`.
5. `packages/server/src/Chats/`:
   - `Retrieval.ts` (pure `searchTerms`, `scoreNote`, the fallback rule) and `Retrieval.test.ts`;
   - `ChatsRepo.ts`: owner-filtered retrieval, the person lookup, the turn batch,
     `completeAnswer`/`failAnswer` latched on `status = 'streaming'`, the retry claim, keyset list
     with `q`, get with stale mapping, pin, delete, feedback, and preference;
   - `Policy.ts`;
   - `ChatsService.ts` (`ask`, `retry`, `list`, `get`, `pin`, `remove`, `feedback`, `models`,
     `selectModel`, and `CHAT_MODELS`);
   - `Http.ts`: each handler is one expression, and the streaming ones go through Hono's `streamSSE`
     and one `pipe` helper;
   - `Chats.test.ts` (the §7 cases) and `Chats.http.test.ts`.
6. `container.ts`: wire `ChatsService` under `traced()`, and pass the fake its `sleep`,
   `tokenDelayMs` and `readChatMode`. `apps/api`: mount the router, add the `Chats` OpenAPI tag,
   and add the `on-error.ts` cases and tests.
7. `E2E`:
   - `E2E_CHATS` in `Fixtures.ts` and the seed writes;
   - the `chat` switch;
   - `POST /e2e/chat` and `/e2e/chat/release`;
   - reset clears it;
   - `E2E.test.ts` cases.
8. `packages/apiclient`:
   - `chats.ts` (every JSON route through `endpoint`);
   - `chatStream.ts`, a pure SSE parser from a `ReadableStream<Uint8Array>` to typed `ChatEvent`s,
     plus `askChat(fetchImpl, url, body)`, which takes the fetch as a parameter so native can pass
     `expo/fetch`;
   - `chatStream.test.ts`;
   - query keys (`chats.list(q)`, `chats.detail(id)`, `chat.models`). `done` invalidates the list
     and the detail.
9. Add the §7 scenario names to `docs/TESTING.md` §4, and the §10 blockers to
   `docs/plan/BLOCKERS.md`.

### Native (apps/native)

1. Routes: `app/ask/index.tsx` (modal), `app/ask/note/[noteId].tsx`, `app/ask/person/[personKey].tsx`,
   and the formSheets `app/ask/history.tsx`, `app/ask/activity/[messageId].tsx` and
   `app/ask/citation/[noteId].tsx`, all registered in `_layout.tsx` with `SHEET` and the 0.55 detent.
2. `features/chat/`:
   - `ChatScreen.tsx` (the nav row, the empty, thread, loading and error states, auto-scroll);
   - `Composer.tsx` (the growing input, the rotating placeholder, attach, model pill, SendButton,
     and the Send return key);
   - `AnswerView.tsx` (the activity row, `NoteMarkdown` with inline citation chips, the status
     line, Retry, the action row, feedback);
   - `ModelMenu.tsx`;
   - `useChatStream.ts`, which drives `askChat` with `expo/fetch`, holds the optimistic turn,
     applies events and invalidates queries;
   - `copy.ts`.
3. Pure helpers with unit tests:
   - `placeholder.ts` (`placeholderAt`);
   - `greeting.ts` (first name, and the no-name fallback);
   - `citations.ts`, which splits markdown into text and `[k]` chip segments and drops unknown
     markers;
   - `historyGroups.ts` (`groupThreads`, date labels);
   - `stripMarkers` for Copy.
4. History sheet: the sections, the rows with the swipe (Delete, Pin/Unpin) and the long-press
   `ActionMenu`, the debounced search, the empty, no-results and error states, and paging.
5. The Activity sheet (timeline, expandable steps, nested note rows opening the preview) and the
   note preview sheet (serif title, meta pill, body, and its states).
6. Wiring:
   - `home-ask-button` opens the global chat;
   - `note-ask-button` pushes the note chat;
   - attendee rows become pressable and open the person chat;
   - `tokens.ts` gains `colors.bg.history` (`#1C1C1C`) and the chip text colour if it is not
     `text.primary`.
7. Maestro:
   - `scripts/e2e-chat.js` and `scripts/e2e-chat-release.js`;
   - the subflows `set-chat`, `release-chat`, `open-global-chat`, `open-history` and
     `wait-for-answer`;
   - the fourteen `phase-7/*.yaml` flows in §8;
   - the `phase-2/home-shell-inert.yaml` edit;
   - the §8 screenshots;
   - `TESTING.md` §8's layout list.
