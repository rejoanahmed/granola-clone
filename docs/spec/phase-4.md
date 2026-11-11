# Phase 4: Notes: list, detail, edit, trash

Status: spec. Source: `<discovery>/` (`README.md` tokens and ids, `COPY.md`,
`FEATURES.md`, `NAVIGATION.md`, `DATA-MODEL.md`, `NOT-EXERCISED.md`, `screens/01`, `02`, `03`, `10`,
`11`, `12`, `16`, `31`, `40`, `41`). Screens are cited as `#NN`. The product is **Notes**. Wherever
discovery copy names the other product, this spec says "Notes" instead. No logo, asset, font or
note content from it is used. The seeded note bodies in §6.7 are written here.

**What discovery saw, and what it did not.** It saw the populated list (#01), the row long-press
menu (#02), the swipe action (#03), both note details (#10, #11, #40), the More menu (#12, #41), the
attendees sheet (#16) and the markdown editor opened and closed without edits (#31). It pressed
**none** of the writes (`NOT-EXERCISED.md`): Edit title, Move to trash (swipe and menu), Save edits,
Copy notes, Share. It never saw the empty list, a list longer than one screen, a loading or error
state, the editor with unsaved edits, or what follows a trash. Everything in those gaps is **our
design** in the visual language of the screens that were seen, and is marked *(ours)*.

## 1. Scope

In scope:

1. **API: notes CRUD.** Create, read, list, edit (title and markdown body), trash and restore, all
   scoped to the caller. The list is keyset-paginated, newest first, and excludes trashed notes.
   Trash is a soft delete (`trashedAt`). Attendees are stored per note, and the owner is always one
   of them (`isMe`).
2. **Home list (#01).** Notes grouped by local day, newest first, with the source tile, title and
   time. Pull to refresh. The next page loads on scroll. The designed **empty**, **loading** and
   **error** states *(ours)*.
3. **Row gestures.** Long-press opens the row menu (#02): **Edit title**, **Share notes**. Swipe
   left reveals **Move to trash** (#03). A trash shows an Undo toast *(ours)*.
4. **Edit title** *(ours; #02's item was never pressed)*: a small sheet in #16's chrome.
5. **Note detail (#10, #11, #40).** Serif title, the date and attendees pill, the Add-to-folder
   button (inert), the markdown body rendered as #10 renders it, the Share pill, the More button and
   the Ask pill (inert).
6. **Attendees sheet (#16).** A half-height sheet listing the note's attendees, the caller marked
   "(me)".
7. **More menu (#12).** **Edit notes**, **Copy notes**, **Move to trash**. **View transcript** is
   hidden until a note has a transcript (phase 5).
8. **Markdown editor (#31).** Raw markdown source with Close (x) and Save (✓), plus the keyboard
   toggle. Closing with no edits has no prompt, as #31 showed. Closing **with** unsaved edits asks
   first *(ours)*.
9. **E2E seed.** Fixed notes for `person` and `other`, and a third seeded user `empty` who has none.

Out of scope, and owned by the phase named: creating a note from the + FAB and the transcript
(5); generated notes and titles (6); every Ask pill (7); people pages and adding attendees (8);
Add to folder, on the row menu and on the detail (9); a trash viewer, restoring anything other than
through Undo, and purging trashed notes (not planned; recorded in §9); sharing a note with another
Notes user (out of the plan).

In this phase **the + FAB, both Ask pills, the detail's Add-to-folder button and the attendees
sheet's Add pill render, carry their testID and label, and give press feedback, but do nothing**,
the same rule phase 2 used for the toolbar.

## 2. Screens and routes

| Route | Screen | Presentation | Discovery |
| --- | --- | --- | --- |
| `app/index.tsx` | Home, now with the notes list | stack root | #01, #02, #03 |
| `app/notes/[id]/index.tsx` | Note detail | push | #10, #11, #40 |
| `app/notes/[id]/attendees.tsx` | Attendees sheet | `formSheet`, detent `[0.7]` | #16 |
| `app/notes/[id]/edit.tsx` | Markdown editor | `fullScreenModal`, gesture dismiss off | #31 |
| `app/notes/[id]/rename.tsx` | Edit title sheet | `formSheet`, `fitToContents` | *(ours)*, #16 chrome |

All are private routes: `isPublicNativeRoute(["notes", …])` is `false`. The More menu and the row
menu are overlays inside their screens, not routes.

Every screen uses the phase-2 tokens only (`src/design/tokens.ts`). A hex literal outside that file
fails `tokens.test.ts`. Measurements below are in points, taken from `source.xml` on the 428pt
discovery device. The simulator is 402pt wide, so widths that span the screen are expressed as
gutters, not absolutes.

### 2.1 Home list (#01)

The phase-2 header band (toolbar, "My notes", events card) is unchanged. The phase-2 `ScrollView`
`home-list` becomes a `SectionList` with the same testID, the same `bg.list` fill and the same
bottom content inset (64 + 16 + the bottom safe area), so the last row clears the floating bar.

**Sections.** One per local calendar day, newest day first. Within a day, rows run newest first.
The order is the API's (`startedAt` desc, then `id` desc). The client only groups consecutive rows,
so a page boundary inside a day extends that day's section rather than repeating its header.

- **Day header** `home-day-<yyyy-mm-dd>` (the local date): `secondary` (17pt, `text.secondary`),
  24 left inset. Format `EEE d MMM`, exactly as #01 ("Sat 12 Sep", "Wed 5 Aug"). A day outside the
  current year appends the year, "Fri 12 Sep 2025" *(ours: discovery only had one year)*. There is
  no "Today" or "Yesterday": #01 never showed one, and the pill (§2.4) is where "Today" appears in
  #102. The first header sits 28 below the top of the band. There are 12 from a header to its first
  row, and 28 from a section's last row to the next header.
- **Row** `home-note-<id>` (discovery `noteListItem-<uuid>`). A `Pressable` that is one
  accessibility element, labelled `"{title}, {time}"` as #01 is ("Preservation effort planning,
  9:39 AM"). 20 gutter, 52 tall, 8 between rows. Contents: a 44pt `IconTile` (`bg.tile`, 1px
  `border.hairline`, radius 10) holding a lucide `Smartphone` glyph for `source: "phone"`, then 12
  gap, then two lines: the **title** (`rowTitle`, 1 line, tail-truncated) and the **time**
  (`caption`, 15pt `text.secondary`, format `h:mm a`, "9:39 AM"; #01's source.xml puts it 20 below the title's top, so the two line boxes touch). Tap pushes `notes/[id]`. Pressed state: the row's
  background is `bg.tile` at the row's full width with radius 12.
- Because the row is one accessibility element, its title and time are not separately reachable.
  Flows assert the row's text, which is its label, with a regex (`"Renamed by Maestro, .*"`).

**Pull to refresh** *(ours: #01 had one page and did not bounce)*: a `RefreshControl` with
`tintColor` `text.secondary`, refetching the first page. The band still does not bounce when the
list is empty (`alwaysBounceVertical` is false only in the empty state).

**Next page.** `onEndReached` at threshold 0.5 fetches the next cursor while one exists. The footer
shows a small `ActivityIndicator` (`text.secondary`) `home-list-more` while it loads.

### 2.2 Row gestures

**Long-press (#02).** Holding a row for 500 ms (the iOS default) opens the row menu:

- The rest of the screen dims under a scrim (`bg.scrim`), and the pressed row is redrawn above it
  on `bg.list`, scaled to 1.03 (the lifted preview in #02).
- The menu, `home-note-menu`, sits 12 below the row, right-aligned to the row's right edge. If it
  would not fit above the floating bar, it sits 12 above the row instead. It is 250 wide with
  `bg.sheet` fill, 1px `border.hairline` and radius 26, with 50pt items (#02). Each item has a 22pt
  leading lucide glyph at 24 inset, then the label in `body` at 58 inset:
  - `Pencil` **Edit title** `home-note-menu-edit-title`: presents `notes/[id]/rename`.
  - `Share` **Share notes** `home-note-menu-share`: opens the iOS share sheet (§2.8).
  - **Add to folder** from #02 is **left out** until phase 9 adds it. A menu item that does
    nothing would be worse than a missing one.
- Tapping the scrim (`action-menu-scrim`) dismisses it with no change, as #02 does.

This is **drawn by us, not a native `UIContextMenu`**: native menu items carry no testID, and
Maestro selects by id only. That is the same departure phase 3 made for the user-type menu (#84).
At rest it matches #02.

**Swipe left (#03).** The row is a `ReanimatedSwipeable` (react-native-gesture-handler, already a
dependency) with one trailing action and no leading action. #03 showed that a short right swipe
opens the note, and a leading action would steal that.

- The row content slides left by 114 when the action is fully open (#03).
- The action `home-note-<id>-trash` is centred vertically on the row, 24 from the right edge. It is
  a red capsule 94×31 (`destructive` fill, radius pill) with a white lucide `Trash2` glyph at 18pt,
  and the caption **"Move to trash"** 6 below it in `caption` (15pt, `text.secondary`). The whole
  column is one button labelled "Move to trash".
- Tapping it trashes the note (§2.3). A full swipe does **not** trash on release *(ours: #03 never
  showed one, and an accidental long swipe should not destroy anything)*. Swiping right, or
  scrolling the list, closes the action. Opening one row's action closes any other.

### 2.3 Trash and Undo *(ours)*

Trashing from the swipe, from the detail's More menu or anywhere else goes through one function,
`useTrashNote()`:

1. The note is removed from the cached list at once (optimistic). The section disappears when it
   empties, and the list falls to its empty state when the last note goes.
2. `POST /notes/{id}/trash`.
3. Once the request has landed, a **toast** shows "Moved to trash" with the action **"Undo"**
   (§2.9). It waits for the trash so an Undo can never reach the server first, where the restore
   would be a no-op and the trash would then land after it. Undo calls `POST /notes/{id}/restore`
   and puts the row back where the order says it goes; a row older than everything loaded is left
   for the next page to bring rather than appended. Undo is not tied to the screen that trashed the
   note, so it works after the detail's More menu has popped to home. A failed restore toasts
   "Couldn’t restore the note. Try again."
4. On failure only that row returns (never a snapshot of the whole list, which would undo a second
   trash that succeeded), and the toast reads "Couldn’t move to trash. Try again.", with no action.

There is **no confirmation dialog**. Discovery never pressed Move to trash, an iOS alert has no
testID, and Undo is the safety net instead.

### 2.4 Note detail (#10, #11, #40)

Root `note-screen`, `bg.app` background. Pushed with the native stack header hidden. Content
scrolls under the floating controls, which have no bar background (#11).

1. **Top bar**, floating, 44 tall, 20 gutter, 8 below the top safe area:
   - Left: circular `IconButton` **Back** `note-back` (`ChevronLeft`, label "Back").
   - Right, 8 apart: `PillButton` **"Share"** `note-share` (`button.lightAlt` fill, `text.onLight`
     label, 85×44, discovery `shareNotesButton`), then circular `IconButton` **More** `note-more`
     (`Ellipsis`, label "More", discovery `More`).
2. **Title** `note-title`: `display` (serif 40/46), 24 left and right inset, wrapping with no line
   limit, 20 below the top bar. It is a header for accessibility. A note whose title is empty
   cannot exist (§6.2), so there is no placeholder here. New notes are "Untitled note" (phase 5).
3. **Metadata row**, 12 below the title, 20 left inset:
   - The pill `note-meta-pill`: 36 tall, radius pill, 1px `border.hairline`, no fill, 14
     horizontal padding. It holds a lucide `Calendar` glyph (20pt), 6 gap, the date in `body`
     (`text.primary`), format `MMM d h:mm a` ("Sep 12 9:39 AM"), or "Today h:mm a" for a note started on the
     local day (#105, phase 5), then 16 gap, a `Users` glyph, 6
     gap, and `+{attendee count}` ("+1" when the caller is the only attendee, as in #10). The
     accessibility label is `"{date}, +{count}"`. Tap presents `notes/[id]/attendees`.
   - 8 to its right, the circular **Add to folder** button `note-add-to-folder`: 36pt, 1px
     `border.hairline`, no fill, `FolderPlus` glyph, label "Add to folder". Inert (phase 9).
4. **Body** `note-body`, 16 below the metadata row, 24 inset each side: the note's markdown
   rendered by `NoteMarkdown` (§2.5). Each top-level block carries `note-block-<n>` (0-based). A
   zero-height `note-body-end` sentinel follows the last block, so a flow can scroll to the end
   (#11). The content's bottom inset is 64 + 24 + the bottom safe area. #11 shows no footer after
   the last block, and there is none here.
5. **Ask pill** `note-ask-button`, floating, 20 gutter, 12 above the bottom safe area, 64 tall:
   `PillButton` `tone="dark"` (`bg.iconButton` fill, 1px `border.hairline`) with a filled
   `MessageCircle` glyph and "Ask anything" (`askLabel`), centred (#10). Accessibility label "Ask
   about this note". Inert (phase 7). The content fades under it through a 32pt gradient from
   transparent to `bg.app`, which approximates #10's blur without a native blur view.

**More menu (#12, #41)**, `note-menu`: the §2.2 menu component, anchored below `note-more` with its
right edge on the button's right edge, 8 below it. It has a scrim, as #12 does:

- `NotebookPen` **Edit notes** `note-menu-edit`: presents `notes/[id]/edit`.
- `AlignLeft` **View transcript** `note-menu-transcript`: **not rendered** in this phase. It is
  shown only when the note has a transcript, and no note has one until phase 5.
- `Copy` **Copy notes** `note-menu-copy`: copies the share text (§2.8) with `expo-clipboard`, then
  the toast "Copied to clipboard" *(ours)*.
- A hairline separator, inset 24 each side.
- `Trash2` **Move to trash** `note-menu-trash`, label and glyph in `destructive`: `useTrashNote()`,
  then `router.back()`. The Undo toast shows on home.

### 2.5 Rendering the markdown (#10)

Notes store markdown, and #31 shows what the source looks like: `###` headings, `- ` bullets,
two-space-indented nested bullets, and `- **Bold**` items followed by an indented description
paragraph. `NoteMarkdown` renders exactly that subset. It is a pure parser,
`parseNoteMarkdown(source) → Block[]` in `src/features/notes/markdown.ts`, plus a renderer, and adds
**no dependency**. A full markdown library is more than the notes phase 6 writes need, and each one
brings its own styling to undo.

| Source | Block | Style (from #10) |
| --- | --- | --- |
| `#`, `##`, `###` + text | heading | `rowTitle` (17 semibold), 28 above (0 for block 0), 2 below |
| `- ` or `* ` at indent 0 | bullet, level 0 | 6pt filled dot in `text.secondary` at x 10, text at x 24 |
| the same at indent 2 (or a tab) | bullet, level 1 | 6pt hollow circle (1.5pt stroke, `text.secondary`) at x 34, text at x 48 |
| deeper | level 1 | clamped. #10 never goes deeper. |
| a line indented under a bullet, after a blank line or not | continuation paragraph | aligned with its bullet's text, `body`, 4 above |
| any other run of lines | paragraph | `body`, 12 between paragraphs |
| `**x**` | bold span | weight 600 |
| `*x*` or `_x_` | italic span | italic (the #40 tip) |
| blank lines | separators only | — |

Body text is 17pt with line height 24 (#10's line pitch, measured), in `text.primary`. Bullets
within one list are 8 apart. Anything outside the subset (links, code, tables) renders as its
literal text in a paragraph. Nothing is dropped, and nothing throws.

### 2.6 Attendees sheet (#16)

`notes/[id]/attendees`, a `formSheet` at the 0.7 detent (#16's grabber sits at y 270 of 926, so its sheet is not iOS's half), drawn with the phase-2 `SheetChrome`
(`bg.sheet`, top radius 40, the grabber). Root `attendees-sheet`.

- Header: the left slot holds the **"Add"** pill `attendees-add` (the borderless `bg.sheetControl`
  pill from #16, discovery `attendeeListSheetAddButton`), inert until phase 8. The centred title is
  **"Attendees"** (`title`). The right slot holds the circular close `attendees-close` (label
  "Close", discovery `xmark`). The phase-2 divider sits under the header.
- One row per attendee, `attendees-row-<attendeeId>`, 64 tall, 24 inset: a 40pt circular avatar
  (`bg.tileRaised`, showing the attendee's initial in `rowTitle`; there are no photos), 16 gap,
  then the name in `body`. The caller's row reads **"{name} (me)"** (#16). An attendee with no name
  shows their email. A 1px `border.hairline` separator runs under every row, inset 24 on the left
  and right as #16's is.
- Order: the caller first, then the rest in the order stored (`position`).
- Rows are not pressable. #16 showed that tapping or swiping one does nothing.
- Swipe down or `attendees-close` dismisses.

### 2.7 Markdown editor (#31)

`notes/[id]/edit`, a `fullScreenModal` on `bg.app`. Root `note-editor-screen`.

- **Input** `note-editor-input`: a multiline `TextInput` holding the raw `bodyMarkdown`, not the
  title. 17pt SF Pro, line height 28 (#31's pitch), `text.primary`, 24 horizontal padding.
  `keyboardAppearance="dark"`, cursor and selection `accent.lime`, `autoCorrect` on, `autoFocus`,
  and no length counter. The top content inset clears the floating buttons (top safe area + 44 +
  16). The text scrolls under them, as in #31. The caret starts at the end of the text, which is
  where #31 opened, scrolled near the end.
- **Close** `note-editor-close`: a circular `IconButton` top-left, 20 gutter, `X`, label "Close
  editor".
- **Save** `note-editor-save`: a 44pt circle top-right with `button.lightAlt` fill and a `Check`
  glyph in `text.onLight`, label "Save edits" (discovery `saveGeneratedNoteEditingButton`).
- **Keyboard toggle** `note-editor-keyboard-toggle`: a circular `IconButton`, 20 from the right, 12
  above the keyboard (`KeyboardStickyView`), with the `Keyboard` glyph (discovery
  `noteEditingKeyboardToggleButton`). It dismisses the keyboard, label "Hide keyboard". When the
  keyboard is down it sits 12 above the bottom safe area and refocuses the input, label "Show
  keyboard".

Behaviour:

- **Save with changes**: `PATCH /notes/{id}` `{ bodyMarkdown }`. The check is replaced by an
  `ActivityIndicator` (`text.onLight`) while in flight, and the input is read-only. On success, the
  detail cache takes the returned note and the modal closes. The detail then shows the rendered new
  body.
- **Save with no changes**: closes without a request.
- **Save failure**: a banner `note-editor-error` sits under the top buttons (`caption` in
  `destructive` on `bg.list`, radius 12, 12 padding): "Couldn’t save your changes. Try again." The
  text is kept.
- **Close with no changes**: closes with no prompt (#31).
- **Close with unsaved changes** *(ours)*: the §2.2 menu opens below Close, root
  `note-editor-discard-menu`, left-aligned to it. It has two items: `Trash2` **"Discard changes"**
  `note-editor-discard` in `destructive`, which closes without saving, and `Pencil` **"Keep
  editing"** `note-editor-keep`, which dismisses the menu. Tapping the scrim is "Keep editing".
- A 409 `NoteTrashed` (trashed on another device mid-edit), or a 404 `NoteNotFound`, closes the
  editor and pops to home with the toast "This note was moved to trash."
- The input is not rendered until the note has loaded (a spinner, `note-editor-loading`, stands in
  on a deep link or a cold cache): text typed before the body arrived would stop it loading, and
  Save would replace the body with only that text.
- The caret tint is applied once the input is focused: set at mount, it misses an autofocused
  caret, which stays system blue.

### 2.8 Share and copy text

`Share notes` (row menu), the `Share` pill and `Copy notes` all use one pure function,
`noteShareText(note) = "# {title}\n\n{bodyMarkdown}"`, trimmed. Share uses React Native's built-in
`Share.share({ message, title })` (no new dependency). From the row menu the note's detail is read
from the cache, or fetched when absent, and the sheet opens once it resolves. A fetch that fails
toasts "Couldn’t share this note. Try again.", and a failed copy "Couldn’t copy the notes. Try
again.", so neither tap silently does nothing. The iOS share sheet is system-owned and has no
testID, so **no flow asserts it** (§9).

### 2.9 Toast *(ours)*

A new primitive, `src/design/Toast.tsx`, shown through a `ToastProvider` at the root layout (one
toast at a time, and a new one replaces the old one):

- It floats 12 above the screen's bottom bar (above the Ask/FAB row on home, above the Ask pill on
  the detail), 20 gutter, at least 52 tall. Fill `bg.sheet`, 1px `border.hairline`, radius pill,
  20 horizontal padding.
- The message `toast-message` is in `body`. The optional action `toast-action` is right-aligned, in
  `pillLabel` and `accent.lime`, with a 44pt hit area.
- It fades in over 150 ms and hides after 5 s, or at once when its action is tapped. The root is
  `toast`. VoiceOver announces the message (`accessibilityLiveRegion`).
- It is added to the gallery as `gallery-toast`, and the menu component (§2.2) as
  `gallery-action-menu`.

### 2.10 Edit title sheet *(ours)*

`notes/[id]/rename`, a `formSheet` sized to its content, in `SheetChrome` (#16). Root
`rename-sheet`.

- Title **"Edit title"**, close `rename-close` on the right, and an empty left slot.
- 24 below the divider, a `TextField` `rename-input` (phase 3), 20 gutter, prefilled with the
  title, `autoFocus`, all text selected on focus, `returnKeyType="done"` (which submits),
  `maxLength` 200.
- 16 below, a full-width light `PillButton` **"Save"** `rename-save` (`size="lg"`). It is disabled
  while the trimmed value is empty or unchanged. In flight it shows a spinner.
- Success: `PATCH /notes/{id}` `{ title }`. The list and detail caches take the new title and the
  sheet closes.
- Failure: `rename-error`, a `caption` line in `destructive` 8 under the field: "Couldn’t rename
  this note. Try again." A `NoteTrashed` or `NoteNotFound` (trashed or gone on another device) is
  not a failure a retry can fix: the sheet closes to home with the toast "This note was moved to
  trash.", as the editor does (§2.7, which treats a 404 the same way as the 409).

## 3. States

| Screen | State | What shows | Seen in discovery? |
| --- | --- | --- | --- |
| Home list | Loading (first page) | Three skeleton rows in the band, `home-list-loading`: a 44pt `bg.tile` tile and two bars (`bg.tile`, radius 6, 160×14 and 64×12), with no header and no shimmer | No *(ours)* |
| Home list | Populated | §2.1 | #01 |
| Home list | Loading more | §2.1 footer spinner `home-list-more` | No *(ours)* |
| Home list | Refreshing | the `RefreshControl` spinner over the existing rows | No *(ours)* |
| Home list | Empty | §3.1 | No *(ours; the asset name `HomeNotesEmptyState` is all discovery found)* |
| Home list | Error (first page) | `home-list-error`, centred in the band 64 from its top: `body` "Couldn’t load your notes." and a dark `PillButton` "Try again" `home-list-retry`, 16 below. The header band stays usable. | No *(ours)* |
| Home list | Error (next page) | The footer shows "Couldn’t load more. Tap to retry." (`caption`), which is itself the button `home-list-more-retry`. The rows already shown stay. | No *(ours)* |
| Home row | Swiped | §2.2 trash action | #03 |
| Home row | Menu open | §2.2 | #02 |
| Home | Toast | §2.3, §2.9 | No *(ours)* |
| Detail | Loading | The title (and the pill, once `startedAt` is known) paint at once from the list cache. The body shows a centred `ActivityIndicator` `note-loading` in place of the blocks. A deep link with no cache shows only the spinner and the top bar. | No *(ours)* |
| Detail | Populated, long | §2.4, scrolls, controls stay pinned | #10, #11 |
| Detail | Populated, short | the same chrome with a two-paragraph body, the second italic | #40 |
| Detail | Empty body | `bodyMarkdown` is `""`: one `secondary` paragraph "No notes yet. Tap ⋯ and Edit notes to write some." `note-body-empty` | No *(ours)* |
| Detail | Error | `note-error` in place of the body: `body` "Couldn’t load this note." and a dark pill "Try again" `note-retry` | No *(ours)* |
| Detail | Not found | A 404, or a note with `trashedAt` set: `note-not-found`, centred: `displaySheet` "This note isn’t available", `secondary` "It may have been moved to trash.", and a dark pill "Back to notes" `note-not-found-back`. Share and More are hidden. | No *(ours)* |
| More menu | Open | §2.4, without View transcript | #12, #41 (with it) |
| Attendees | Populated | §2.6 | #16 |
| Attendees | Only me | one row, "(me)" | #16 |
| Editor | Pristine | §2.7, keyboard up | #31 |
| Editor | Dirty, close pressed | discard menu | No *(ours)* |
| Editor | Saving / error | spinner / `note-editor-error` | No *(ours)* |
| Rename | Pristine, typed, saving, error | §2.10 | No *(ours)* |

### 3.1 The empty list *(ours)*

Shown when the first page returns no items. It replaces the rows inside `home-list` and never
replaces the header band, so the events card and toolbar are still there. Root `home-empty`, centred
horizontally, 64 below the top of the band, max width 300:

1. A 56pt `IconTile` (`bg.tile`, hairline, radius 14) with the lucide `NotebookPen` glyph at 26pt
   in `text.secondary`.
2. 20 below, **"No notes yet"** in `displaySheet` (serif 34), centred, `home-empty-title`. The serif
   carries the empty state as it does in #60's "Search your notes" and #50's "No folders yet".
3. 8 below, `secondary`, centred: **"Tap + to record your first meeting. Your notes will appear
   here."**

It has no button of its own. The + FAB is the call to action, and it is 200pt below.

## 4. Copy

Discovery copy is verbatim from `COPY.md`, with the product name replaced. Everything marked
*(ours)* was written here.

| Where | Copy |
| --- | --- |
| Home title (#01) | My notes |
| Day header (#01) | `EEE d MMM`, e.g. Sat 12 Sep · plus ` yyyy` outside the current year *(ours)* |
| Row time (#01) | `h:mm a`, e.g. 9:39 AM |
| Row a11y (#01) | {title}, {time} |
| Row menu (#02) | Edit title · Share notes |
| Swipe action (#03) | Move to trash |
| Detail share pill (#10) | Share |
| Metadata pill (#10) | `MMM d h:mm a` · +{count}, e.g. Sep 12 9:39 AM · +1 |
| More menu (#12) | Edit notes · View transcript *(hidden this phase)* · Copy notes · Move to trash |
| Detail a11y (#10) | Back · More · Add to folder |
| Ask pill (#10) | Ask anything · a11y "Ask about this note" *(ours)* |
| Attendees (#16) | Add · Attendees · {name} (me) |
| Editor a11y (#31) | Close editor · Save edits · Hide keyboard · Show keyboard *(ours)* |
| Short-note body (#40), seeded | Not much to transcribe here. The recording captured only a brief greeting with no substantive discussion, decisions, or follow-ups. / *Notes works best with real conversations, meetings, or notes to self. Try recording a call, a catch-up, or even a personal brain dump.* |
| Default title (#102) | Untitled note |
| Empty list *(ours)* | No notes yet · Tap + to record your first meeting. Your notes will appear here. |
| List error *(ours)* | Couldn’t load your notes. · Try again · Couldn’t load more. Tap to retry. |
| Detail empty body *(ours)* | No notes yet. Tap ⋯ and Edit notes to write some. |
| Detail error *(ours)* | Couldn’t load this note. · Try again |
| Detail not found *(ours)* | This note isn’t available · It may have been moved to trash. · Back to notes |
| Toasts *(ours)* | Moved to trash · Undo · Couldn’t move to trash. Try again. · Copied to clipboard · This note was moved to trash. |
| Editor *(ours)* | Couldn’t save your changes. Try again. · Discard changes · Keep editing |
| Rename *(ours)* | Edit title · Save · Couldn’t rename this note. Try again. |

Date and time strings come from pure functions in `src/features/notes/format.ts`
(`formatDayHeader`, `formatRowTime`, `formatPillDate`). They build the strings from
`Intl.DateTimeFormat(…).formatToParts` with an explicit `timeZone` argument (defaulting to the
device's), and fixed English month and weekday names, so "Sat 12 Sep" does not turn into
"Sat, Sep 12" under an en-US locale. They are unit-tested with `timeZone: "UTC"` and
`"Asia/Dhaka"`.

## 5. testIDs

| testID | Element | Discovery id |
| --- | --- | --- |
| `home-list` | The list (now a `SectionList`) | `homeCollectionView` |
| `home-day-<yyyy-mm-dd>` | Day header | |
| `home-note-<id>` | Row; text = "{title}, {time}" | `noteListItem-<uuid>` |
| `home-note-<id>-trash` | Swipe action | (label "Move to trash") |
| `home-note-menu`, `home-note-menu-edit-title`, `home-note-menu-share` | Row menu | (none) |
| `action-menu-scrim` | Any menu's scrim | |
| `home-list-loading`, `home-list-more`, `home-list-more-retry`, `home-list-error`, `home-list-retry` | List states | |
| `home-empty`, `home-empty-title` | Empty state | |
| `toast`, `toast-message`, `toast-action` | Toast | |
| `note-screen`, `note-back`, `note-share`, `note-more` | Detail chrome | `Back`, `shareNotesButton`, `More` |
| `note-title`, `note-meta-pill`, `note-add-to-folder`, `note-ask-button` | Detail header, footer | `Add to folder` |
| `note-body`, `note-block-<n>`, `note-body-end`, `note-body-empty` | Body | |
| `note-loading`, `note-error`, `note-retry`, `note-not-found`, `note-not-found-back` | Detail states | |
| `note-menu`, `note-menu-edit`, `note-menu-transcript` (phase 5), `note-menu-copy`, `note-menu-trash` | More menu | |
| `attendees-sheet`, `attendees-sheet-grabber`, `attendees-add`, `attendees-close`, `attendees-row-<attendeeId>` | Attendees | `attendeeListSheetAddButton`, `xmark` |
| `note-editor-screen`, `note-editor-input`, `note-editor-close`, `note-editor-save`, `note-editor-keyboard-toggle`, `note-editor-error` | Editor | `saveGeneratedNoteEditingButton`, `noteEditingKeyboardToggleButton` |
| `note-editor-discard-menu`, `note-editor-discard`, `note-editor-keep` | Discard menu | |
| `rename-sheet`, `rename-input`, `rename-save`, `rename-close`, `rename-error` | Edit title | |
| `gallery-toast`, `gallery-action-menu` | Gallery additions | |

## 6. API

### 6.1 Data (`packages/db`)

New table **`notes`** (`schema/notes.ts`). Keys are alphabetical, and timestamps are integer epoch
milliseconds:

| Column | Type | Notes |
| --- | --- | --- |
| `bodyMarkdown` | text, not null, default `""` | ≤ 100 000 chars |
| `createdAt` | integer, not null | |
| `id` | text, PK | `not_…` |
| `ownerId` | text, not null, FK `user.id` `on delete cascade` | |
| `source` | text, not null | `phone` (the only value until phase 5 says otherwise) |
| `startedAt` | integer, not null | what the list sorts and groups by |
| `title` | text, not null | 1–200 after trimming |
| `trashedAt` | integer, null | set once by trash, cleared by restore |
| `updatedAt` | integer, not null | |

Index `notes_owner_live_idx` on `(owner_id, started_at desc, id desc)` **where `trashed_at is
null`**, a partial index (drizzle emits these, D009). That is the list query's whole access path.

New table **`note_attendees`** (`schema/note-attendees.ts`):

| Column | Type | Notes |
| --- | --- | --- |
| `createdAt` | integer, not null | |
| `email` | text, null | |
| `id` | text, PK | `att_…` |
| `name` | text, null | at least one of `name`/`email` is not null (a `CHECK`) |
| `noteId` | text, not null, FK `notes.id` `on delete cascade`, indexed | |
| `position` | integer, not null | order within the note, 0 = the owner |
| `userId` | text, null, FK `user.id` `on delete set null` | set for the owner's row |

The owner's row stores `userId` and no name. Its name is read from better-auth's `user.name` at
query time, so renaming yourself renames you on every note. `isMe` is computed as
`userId === actor.id`, never stored.

Both tables join `RESET_ORDER` ahead of `profiles`: `[noteAttendees, notes, emailOutbox,
profiles]`. One migration, `bun run db:generate`.

### 6.2 Domain (`packages/domain`)

```ts
// Domain/Note.ts
export const NoteId = branded("NoteId", "not_");
export const AttendeeId = branded("AttendeeId", "att_");
export const NoteSource = z.enum(["phone"]);
export const NoteTitle = z.string().trim().min(1).max(200);
export const NoteBody = z.string().max(100_000);

export const Attendee = z.object({
  email: z.string().nullable(),
  id: AttendeeId,
  isMe: z.boolean(),
  name: z.string().nullable(),
});
export const Note = z.object({
  attendees: z.array(Attendee),          // the owner first, then by position
  bodyMarkdown: NoteBody,
  createdAt: Timestamp,
  id: NoteId,
  source: NoteSource,
  startedAt: Timestamp,
  title: NoteTitle,
  trashedAt: Timestamp.nullable(),
  updatedAt: Timestamp,
});
export const NoteSummary = z.object({
  attendeeCount: z.number().int().min(1),
  id: NoteId,
  source: NoteSource,
  startedAt: Timestamp,
  title: NoteTitle,
});
export const AttendeeInput = z
  .strictObject({ email: z.email().max(254).optional(), name: z.string().trim().min(1).max(100).optional() })
  .refine((a) => a.email !== undefined || a.name !== undefined);
export const NoteCreate = z.strictObject({
  attendees: z.array(AttendeeInput).max(50).optional(),  // besides the owner, who is always added
  bodyMarkdown: NoteBody.optional(),                      // default ""
  startedAt: Timestamp.optional(),                        // default clock.now()
  title: NoteTitle.optional(),                            // default "Untitled note"
});
export const NotePatch = z.strictObject({
  bodyMarkdown: NoteBody.optional(),
  title: NoteTitle.optional(),
});
```

`NoteSummary` carries no body, so a page of 100 rows stays small. `attendeeCount` includes the
owner, which is why it is at least 1 and why #10's pill reads "+1" for a solo note.

### 6.3 Routes (`packages/domain/src/Notes/Contract.ts`, tag `Notes`)

| Route | Name | Input | 2xx | Errors |
| --- | --- | --- | --- | --- |
| `GET /notes` | `listNotesRoute` | query `PageQuery` (`cursor`, `limit` 1–100, default 20) | 200 `PageOf(NoteSummary)` | 401, 422 (a malformed cursor) |
| `POST /notes` | `createNoteRoute` | `NoteCreate` | 201 `Note` | 401, 422 |
| `GET /notes/{id}` | `getNoteRoute` | param `id` | 200 `Note` (a trashed one included, with `trashedAt`) | 401, 404 `NoteNotFound`, 422 |
| `PATCH /notes/{id}` | `patchNoteRoute` | `NotePatch` | 200 `Note` | 401, 404, 409 `NoteTrashed`, 422 |
| `POST /notes/{id}/trash` | `trashNoteRoute` | — | 200 `Note` | 401, 404 |
| `POST /notes/{id}/restore` | `restoreNoteRoute` | — | 200 `Note` | 401, 404 |

Errors (`packages/domain/src/Notes/Errors.ts`): `NoteNotFound` (404) and `NoteTrashed` (409). A
malformed cursor is the shared `ValidationFailed` (422) with `details: { field: "cursor" }`.

Rules:

- **Another user's note is a 404 `NoteNotFound`, byte-identical to a note that does not exist.**
  Never a 403. A 403 would confirm that the id exists, and ids are not secret. The body carries
  `details: { id }` with the id the caller sent, and nothing about the owner.
- **The list is scoped by construction.** The repo's list query filters on `ownerId = actor.id`.
  There is no parameter that names an owner.
- **Keyset, never `OFFSET`.** The order is `startedAt desc, id desc`. The cursor is opaque:
  base64url of `[startedAt, id]`, encoded and decoded by `Notes/Cursor.ts` (a plain module, so the
  service can use it without importing the repo as a value). The repo fetches `limit + 1` rows,
  and `nextCursor` is non-null exactly when the extra row existed. A cursor that fails to decode is
  a 422, never silently page one.
- **PATCH** changes only the keys present. `{}` is a no-op that returns the note and does not move
  `updatedAt`. Title and body are last-write-wins. There is no version field in this phase (§9).
  A PATCH to a trashed note is `409 NoteTrashed`.
- **Trash is idempotent**: `trashedAt = coalesce(trashedAt, now)`. A second trash returns the note
  with its first stamp. `updatedAt` moves only on the first. **Restore is idempotent**: restoring a
  live note is a 200 no-op.
- **Create** always writes the owner's attendee row at `position 0`, then the inputs at `1…n`, in
  one `UnitOfWork` batch with the note, so a note never exists without its owner row.
- **Policy** (`packages/server/src/Notes/Policy.ts`): `canReadNote` and `canEditNote` (both `note.ownerId
  === actor.id`, pure, `Authorized<Note>`). The service reads by id, then calls the predicate
  through a local `visible(note, actor)` helper that throws `NoteNotFound`, never `Forbidden`, when
  the note is absent **or** the predicate fails. The `Authorized` brand still makes a method that
  skipped the check fail to compile. The repo's internal row carries `ownerId`. The wire `Note`
  does not.

### 6.4 Server (`packages/server/src/Notes/`)

`NotesRepo.ts` (`makeNotesRepo(db)`): `byId(id)` (the note with attendees, joined to `user` for the
owner's name, plus `ownerId`), `listLive(ownerId, after: {startedAt, id} | null, limit)`,
`stageCreate(stage, note, attendees)`, `update(id, patch, now) → boolean`, `trash(id, now)`,
`restore(id, now)`. It uses `null`, never `undefined`, reads no clock, and checks no policy.

`NotesService.ts`: `makeNotesService({ clock, ids, repo, uow })` with `list`, `create`, `get`,
`update`, `trash`, `restore`, each taking the `Actor` first. `Http.ts` has one line per route.
`container.ts` wires it with `traced("Notes", …)` and `traced("NotesRepo", …)`. `apps/api/src/app.ts`
mounts `notesRouter`, and `openapi.ts` adds the `Notes` tag.

### 6.5 API client (`packages/apiclient`)

`src/notes.ts` `makeNotesApi(endpoint)`: `listNotes`, `createNote`, `getNote`, `updateNote`,
`trashNote`, `restoreNote`, composed into `makeApiClient`. Query keys:
`notes.all = ["notes"]`, `notes.list() = ["notes", "list"]`, `notes.detail(id) = ["notes",
"detail", id]` (safe against the prefix rule: `not_` ids can never equal `"list"`). Invalidation:
`updateNote(id)`, `trashNote(id)` and `restoreNote(id)` → `[notes.detail(id), notes.list()]`,
`createNote()` → `[notes.list()]`. If `makeQueryApi` has no infinite-query helper, add
`api.infinite(key, fetchPage)` returning plain options for `useInfiniteQuery`
(`initialPageParam: null`, `getNextPageParam: (p) => p.nextCursor`), still without importing
TanStack.

### 6.6 E2E harness

- `E2E_USERS` gains **`empty: { email: "e2e-empty@kothanote.test", id: "usr_e2e_empty", name: "E2E
  Empty" }`**, seeded and onboarded like the others, with **no notes**. The empty-list flow signs in
  as it. Every existing loop over `E2E_USERS` (seed, `signIn`, `isE2eRole`) picks it up.
  `E2E_PROFILES.empty = {}`.
- `POST /e2e/seed` additionally writes the `E2E_NOTES` fixtures (§6.7) with their fixed ids,
  in the same `UnitOfWork` batch as the users. `POST /e2e/reset` clears them through `RESET_ORDER`.
- The seed's response gains `notes: { id, ownerRole, title }[]`, so an API journey can name them.

### 6.7 Seeded notes (`packages/server/src/E2E/Fixtures.ts`, `E2E_NOTES`)

Fixed ids and **absolute** times, so every run draws the same list. The times are chosen so the
local date is the same in every zone from UTC−8 to UTC+13, which covers this machine (UTC+6) and any
likely CI runner. All are `source: "phone"`.

| id | owner | title | `startedAt` (UTC) | trashed | attendees |
| --- | --- | --- | --- | --- | --- |
| `not_e2e_launch` | person | Launch planning review | 2026-09-12 10:00 | no | me, Priya Raman `priya@example.com`, Sam Okafor `sam@example.com` |
| `not_e2e_standup` | person | Weekly standup | 2026-09-12 08:00 | no | me |
| `not_e2e_solo` | person | Solo reflection thoughts | 2026-08-05 09:00 | no | me |
| `not_e2e_archived` | person | Archived kickoff | 2026-09-10 09:00 | 2026-09-11 09:00 | me |
| `not_e2e_other` | other | Other person’s private note | 2026-09-12 09:00 | no | me (other) |

So `person`'s list is **Sat 12 Sep**: Launch planning review, then Weekly standup. Then **Wed 5
Aug**: Solo reflection thoughts. The archived note and other's note never appear.

`not_e2e_launch` body (long enough to scroll, in #10's shape; written here):

```markdown
### Launch checklist

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

  Check every email in the sequence in iOS Mail and Gmail before the cohort is invited.
```

`not_e2e_standup`: `### Updates\n\n- Pagination merged\n- Editor polish in review`.
`not_e2e_solo`: the #40 body from §4, the second paragraph wrapped in `_…_`.
`not_e2e_archived` and `not_e2e_other`: one paragraph each, "Archived kickoff notes." and "Nobody
but other should ever read this."

## 7. API-level test cases

`packages/server/src/Notes/Notes.test.ts` (the service over the real repo on `makeTestD1()`,
`fixedClock`, `sequentialIds`, actors A and B):

1. `create` with no input gives the title "Untitled note", body `""`, `startedAt = now`,
   `trashedAt: null`, and exactly one attendee, `isMe: true`, carrying the owner's name.
2. `create` with two attendees returns them after the owner, in input order. Their `isMe` is false.
3. `get` returns what `create` returned, for its owner.
4. **Ownership:** B's `get`, `update`, `trash` and `restore` of A's note each throw `NoteNotFound`,
   and after all four A's row is byte-identical (including `updatedAt` and `trashedAt`).
5. **Ownership:** B's `get` of a nonexistent id and of A's id throw errors with equal `_tag`,
   `status` and `details` shape.
6. **Ownership:** `list` for B never contains A's notes, whatever cursor B sends (including a cursor
   minted from A's page).
7. `list` orders by `startedAt` desc then `id` desc. Two notes with the same `startedAt` both appear
   exactly once across pages.
8. Pagination: 25 notes with `limit: 10` gives pages of 10, 10 and 5. The last page has
   `nextCursor: null`, and the union is all 25 with no duplicates. With exactly 20 notes and
   `limit: 20`, `nextCursor` is `null` (the over-fetch, not a count).
9. A note created after page 1 was fetched, with a `startedAt` older than the cursor, appears on a
   later page. A newer one does not shift page 2 (keyset stability).
10. `list` excludes trashed notes. After `restore`, the note is back in its place.
11. A malformed cursor (`"x"`, valid base64 of junk, the wrong tuple shape) throws
    `ValidationFailed` with `details.field === "cursor"`.
12. `update({ title: "New" })` changes the title and `updatedAt`, and leaves the body.
    `update({ bodyMarkdown })` leaves the title. `update({})` returns the note with `updatedAt`
    unmoved.
13. `update` of a trashed note throws `NoteTrashed`.
14. `trash` sets `trashedAt = now`. Advancing the clock and trashing again keeps the first stamp and
    the first `updatedAt`. `get` still returns the trashed note, with `trashedAt`.
15. `restore` clears `trashedAt`. `restore` of a live note is a no-op.
16. Deleting A's `user` row cascades A's notes and their attendees (schema). Deleting a
    non-owner attendee's `user` sets `userId` to null and keeps the row.
17. Renaming A through the `user` row changes the owner attendee's name on `get` (it is read, not
    copied).

`packages/server/src/Notes/Notes.http.test.ts` (wire shape):

18. Every route anonymous → 401 `Unauthorized`.
19. `POST /notes` → 201 and the body parses as `Note`. `GET /notes` → 200 and parses as
    `PageOf(NoteSummary)`, with no `bodyMarkdown` key on any item.
20. `GET /notes?limit=0`, `?limit=101` and `?cursor=` → 422.
21. `POST /notes` `{ title: "   " }`, `{ title: "x".repeat(201) }`, `{ owner: "…" }` (strict) and
    `{ attendees: [{}] }` → 422.
22. `PATCH /notes/{id}` `{ ownerId: "…" }` → 422. A valid patch → 200.
23. `GET /notes/{B's id}` as A → 404 with `_tag: "NoteNotFound"`. `PATCH` on a trashed note → 409
    `NoteTrashed`.
24. `GET /notes/not-an-id` → 422, not 404 (the param schema).

`packages/domain/src/Domain/Note.test.ts`: `NoteTitle` trims and rejects empty. `NoteCreate` and
`NotePatch` reject unknown keys. `AttendeeInput` requires a name or an email.

`packages/server/src/Notes/Cursor.test.ts`: encode then decode round-trips, and each malformed
shape decodes to `null`.

`packages/server/src/E2E/E2E.test.ts` and `apps/api/src/e2e-harness.test.ts`: 25. seed writes the
five fixtures with their fixed ids, and `person`'s `list` is exactly
`[not_e2e_launch, not_e2e_standup, not_e2e_solo]`. 26. `empty`'s list is empty and its profile is
onboarded. 27. reset leaves no `notes` or `note_attendees` rows, and re-seeding restores a fixture
that a journey renamed.

`packages/apiclient/src/client.test.ts`: 28. `listNotes` sends `cursor` and `limit` as query
strings. `trashNote` sends `POST /notes/{id}/trash` with no body. Each decodes its response.

`packages/e2e/src/Journeys/Notes.ts` (the deployed-dev gate), registered in `run.ts`: 29. as
`person`, create a note, patch its body, list it first, trash it, and see it gone from the list.
As `other`, `GET`, `PATCH` and `trash` of that id are 404, and `other`'s list lacks it. Restore as
`person` brings it back.

`docs/TESTING.md` §4 lists the `Notes.test.ts` scenarios by name.

Native unit tests (vitest, `apps/native`):

30. `src/features/notes/markdown.test.ts`: headings of levels 1–3, level-0 and level-1 bullets, a
    tab indent, deeper indents clamped, a bold item with an indented continuation paragraph, italic
    with `*` and `_`, unknown syntax kept as literal text, `""` gives `[]`, and no input throws
    (property-style over a few hundred random strings).
31. `src/features/notes/format.test.ts`: `formatDayHeader` gives "Sat 12 Sep" for
    2026-09-12T10:00Z in UTC and Asia/Dhaka, and appends the year outside the current year.
    `formatRowTime` gives "10:00 AM" (UTC) and "4:00 PM" (Dhaka). `formatPillDate` gives "Sep 12
    10:00 AM".
32. `src/features/notes/group.test.ts`: `groupByDay(items, timeZone)` keeps the API order, merges
    a day split across pages into one section, and uses the local date as the key.
33. `noteShareText` gives "# Title\n\nbody" and trims.

## 8. Acceptance criteria

Every flow lives in `apps/native/.maestro/phase-4/`, is tagged `phase-4` and `regression`, selects
by `id` only, waits with `extendedWaitUntil` (never `sleep`), and starts from
`subflows/start-clean.yaml` (`clearState`, `clearKeychain`, and the reset-and-seed endpoints).
`config.yaml` adds `phase-4/*`. A new subflow, `subflows/open-home-as.yaml` (parameter `EMAIL`),
generalises `open-home.yaml`, which becomes `open-home-as` with `e2e-person`. Day headers are
asserted with the regex `Sat 12 Sep( 2026)?`, so the suite survives New Year.

**AC1. The list shows my notes, grouped by day, newest first, and nobody else's.**
`phase-4/notes-list.yaml`
- Given `e2e-person` signed in and `home-screen` visible
- Then `home-day-2026-09-12` reads "Sat 12 Sep", and `home-day-2026-08-05` reads "Wed 5 Aug"
- And `home-note-not_e2e_launch` reads "Launch planning review, …", and it is above
  `home-note-not_e2e_standup` (Maestro's `below` relation on the second), which is above
  `home-day-2026-08-05`, which is above `home-note-not_e2e_solo`
- And `home-note-not_e2e_archived` (trashed) and `home-note-not_e2e_other` (another user) are
  **not** visible
- And `home-empty` is not visible
- Screenshot `phase-4-home-list` for the visual check against #01.

**AC2. Opening a note shows its title, metadata, attendees and body.** `phase-4/open-note.yaml`
- Given AC1's start
- When the user taps `home-note-not_e2e_launch`
- Then `note-screen` is visible, `note-title` reads "Launch planning review", `note-meta-pill`
  reads `Sep 12 \d{1,2}:\d{2} [AP]M, \+3`, and `note-block-0` reads "Launch checklist"
- And `note-share`, `note-more`, `note-add-to-folder` and `note-ask-button` are visible
- When they scroll until `note-body-end` is visible
- Then `note-back` and `note-ask-button` are still visible (pinned, #11). Screenshots
  `phase-4-note-top` and `phase-4-note-bottom`.
- When they tap `note-meta-pill`
- Then `attendees-sheet` is visible with three `attendees-row-*` rows, the first reading "E2E
  Person (me)". Screenshot `phase-4-attendees`.
- When they tap `attendees-close`
- Then `attendees-sheet` is gone
- When they tap `note-more`
- Then `note-menu` shows `note-menu-edit`, `note-menu-copy` and `note-menu-trash`, and
  **not** `note-menu-transcript`. Screenshot `phase-4-more-menu`.
- When they tap `note-menu-copy`
- Then `toast-message` reads "Copied to clipboard"
- When they tap `note-back`
- Then `home-screen` is visible.
- And the short note: tapping `home-note-not_e2e_solo` shows `note-block-0` starting "Not much to
  transcribe here." and `note-block-1` starting "Notes works best" (#40).

**AC3. Editing and saving the body.** `phase-4/edit-note-body.yaml`
- Given `e2e-person` on `note-screen` for `not_e2e_standup`
- When they tap `note-more`, then `note-menu-edit`
- Then `note-editor-screen` is visible and `note-editor-input` reads the raw source, starting
  "### Updates" (the markdown, not the rendering). Screenshot `phase-4-editor`.
- When they erase the input, type "Edited from Maestro", and tap `note-editor-save`
- Then `note-screen` is visible and `note-block-0` reads "Edited from Maestro"
- When they go back home and the app is relaunched (`subflows/relaunch-app.yaml`), and they open
  `home-note-not_e2e_standup` again
- Then `note-block-0` still reads "Edited from Maestro" (it reached the API, not only the cache).

**AC4. Closing the editor: no prompt when pristine, a choice when dirty.**
`phase-4/edit-note-discard.yaml`
- Given the editor open for `not_e2e_standup`
- When they tap `note-editor-close` without typing
- Then `note-screen` is visible and `note-editor-discard-menu` never appeared (#31)
- When they reopen the editor, type " draft", and tap `note-editor-close`
- Then `note-editor-discard-menu` is visible
- When they tap `note-editor-keep`
- Then the menu is gone, and `note-editor-input` still ends with " draft"
- When they tap `note-editor-close`, then `note-editor-discard`
- Then `note-screen` is visible and `note-block-0` reads "Updates" (nothing saved).
- And, before the dirty close, tapping `note-editor-keyboard-toggle` leaves the toggle visible
  with the label "Show keyboard", and tapping it again brings back "Hide keyboard". The label is
  the only keyboard state a flow can read.

**AC5. Renaming from the row's long-press menu.** `phase-4/rename-note.yaml`
- Given AC1's start
- When they long-press `home-note-not_e2e_launch`
- Then `home-note-menu` shows `home-note-menu-edit-title` and `home-note-menu-share`. Screenshot
  `phase-4-row-menu`.
- When they tap `action-menu-scrim`
- Then the menu is gone and nothing changed
- When they long-press again and tap `home-note-menu-edit-title`
- Then `rename-sheet` is visible and `rename-input` reads "Launch planning review"
- When they erase it
- Then `rename-save` is disabled
- When they type "Renamed by Maestro" and tap `rename-save`
- Then `rename-sheet` is gone and `home-note-not_e2e_launch` reads "Renamed by Maestro, …"
- When they open it
- Then `note-title` reads "Renamed by Maestro".

**AC6. Trashing by swipe, with Undo.** `phase-4/trash-by-swipe.yaml`
- Given AC1's start
- When they swipe `home-note-not_e2e_standup` left
- Then `home-note-not_e2e_standup-trash` is visible. Screenshot `phase-4-swipe`.
- When they tap it
- Then `home-note-not_e2e_standup` is not visible, `toast-message` reads "Moved to trash" and
  `toast-action` reads "Undo"
- When they tap `toast-action`
- Then `home-note-not_e2e_standup` is visible again, below `home-note-not_e2e_launch`
- When they swipe and trash it again and wait until `toast` is gone
- And the app is relaunched
- Then `home-note-not_e2e_standup` is still not visible, and `home-day-2026-09-12` is still there
  (Launch planning review remains in that day).

**AC7. Trashing from the note's More menu.** `phase-4/trash-by-menu.yaml`
- Given `e2e-person` on `note-screen` for `not_e2e_solo`
- When they tap `note-more`, then `note-menu-trash`
- Then `home-screen` is visible, `home-note-not_e2e_solo` is not, `home-day-2026-08-05` is gone
  (its only note left), and `toast-message` reads "Moved to trash"
- When they tap `toast-action` (the detail that started the trash has unmounted by now)
- Then `home-note-not_e2e_solo` and `home-day-2026-08-05` are back
- When they open it again and trash it from `note-menu-trash`, then relaunch the app
- Then `home-note-not_e2e_solo` is still not visible.

**AC8. The empty list.** `phase-4/empty-list.yaml`
- Given `e2e-empty@kothanote.test` signed in (seeded with no notes)
- Then `home-screen`, `home-empty` and `home-empty-title` ("No notes yet") are visible, along with
  the phase-2 header band (`home-events-card`) and the floating bar (`home-ask-button`,
  `home-new-note-button`)
- And no `home-day-*` header is visible. Screenshot `phase-4-empty`.

**AC9. Earlier phases still pass.** The whole `--include-tags=smoke,phase-2,phase-3,phase-4` suite
passes. `phase-2/home-shell.yaml` still finds `home-list` (now populated for `person`), and
`phase-3/sign-up.yaml` lands the newcomer on the empty home.

**AC10. Non-flow checks.** §7's tests pass. Ownership is proven at the API level, not by the UI:
tests 4–6, 23 and 29.

**Exit** (from the phase plan, retired in D036): flows for opening a note (AC2), editing and saving the body (AC3),
renaming (AC5), trashing by swipe (AC6) and by menu (AC7), and the empty list (AC8) pass on the
iPhone 17 Pro simulator. The API tests prove another user's note is unreachable. The cache-busted
`bun run check` and `bun run test` are green.

## 9. Designed-here decisions and known gaps

- Every state and screen marked *(ours)* was designed here: the empty, loading and error states,
  the Undo toast, the Edit title sheet, the discard choice in the editor, and the not-found detail.
- **Menus are drawn by us, not native `UIMenu`s**, so every item has a testID (§2.2). This is the
  same trade-off as phase 3's #84 menu. A native context menu's system blur and haptics are
  approximated, not reproduced.
- **Another user's note is a 404, not a 403** (§6.3). This goes in `docs/DECISIONS.md` as a
  standing decision for every owned resource that follows.
- **No trash viewer and no purge.** A trashed note is restorable only through the Undo toast and
  `POST /notes/{id}/restore`, and it is kept indefinitely. Discovery showed no trash screen.
  Recorded in `BLOCKERS.md` as deferred.
- **Last write wins** for concurrent edits of one note. One person editing on one phone is the
  whole use case until sharing exists. An `ifUpdatedAt` precondition is the upgrade.
- **Add attendee is inert.** Adding somebody needs people (phase 8) and possibly Contacts
  permission, which discovery also avoided (#16).
- **Share and Copy are not flow-asserted beyond the toast.** The iOS share sheet has no testID, and
  Maestro cannot read the clipboard. `noteShareText` is unit-tested instead (test 33).
- `expo-clipboard` is the **one new native dependency**, which means a fresh `bun run e2e:ios`
  build. `ReanimatedSwipeable` comes from the already-installed gesture handler.
- Seed times are absolute and survive UTC−8 to UTC+13 only (§6.7). A simulator set to Hawaii would
  split the Sep 12 day.

## 10. Task lists

### API (`packages/domain`, `packages/server`, `packages/db`, `apps/api`, `packages/apiclient`)

1. `packages/db`: `schema/notes.ts` (with the partial index) and `schema/note-attendees.ts` (with
   the `CHECK`), exported from the barrel and added to `RESET_ORDER` before `emailOutbox` and
   `profiles`. Then `bun run db:generate` for one migration.
2. `packages/domain`: `Domain/Note.ts` (§6.2) and `Note.test.ts`. `Notes/Contract.ts` (six routes,
   §6.3). `Notes/Errors.ts` (`NoteNotFound` 404, `NoteTrashed` 409).
3. `packages/server/src/Notes/`: `Cursor.ts` and `Cursor.test.ts`, `NotesRepo.ts`, `Policy.ts`
   (`canReadNote`, `canEditNote`, and the `visible` → `NoteNotFound` rule), `NotesService.ts`,
   `Http.ts`, `Notes.test.ts` (1–17), `Notes.http.test.ts` (18–24).
4. `packages/server/src/container.ts`: wire `NotesRepo` and `NotesService` with `traced()`, add
   `notes` to `Container`.
5. `apps/api`: mount `notesRouter` in `app.ts`, add the `Notes` tag in `openapi.ts`, and check that
   `on-error.ts` maps both new errors (through their status; add a case to its test if it lists
   tags).
6. `packages/server/src/E2E/`: the `empty` user and profile, `E2E_NOTES` (§6.7) with fixed bodies,
   `stageNotes` in `E2eRepo`, the seed response's `notes`, and tests 25–27 (plus the
   `apps/api/src/e2e-harness.test.ts` cases).
7. `packages/apiclient`: `notes.ts`, composed into `makeApiClient` and exported. Query and
   invalidation keys (§6.5), the infinite-query helper if missing, and test 28.
8. `packages/e2e`: the `Notes` journey (test 29), registered in `run.ts`.
9. Docs: `docs/TESTING.md` §4 gains the Notes scenarios by name. `docs/DECISIONS.md` gains "an
   owned resource you cannot see is a 404". `docs/plan/BLOCKERS.md` gains "No trash viewer or purge
   (phase 4)".

### Native (`apps/native`)

1. Add `expo-clipboard` (Expo-owned `~` range) and rebuild the dev client.
2. `src/design/`: `ActionMenu.tsx` (scrim, anchored popover, items, destructive tone, separator;
   §2.2) and `Toast.tsx` plus `ToastProvider` (§2.9), exported from the barrel and added to the
   gallery (`gallery-action-menu`, `gallery-toast`). Mount `ToastProvider` in `app/_layout.tsx`.
3. `src/lib/api.ts`: `notesInfiniteQuery`, `noteQuery(id)` seeded from the list cache, and the
   mutations `useUpdateNote`, `useTrashNote` (optimistic, with the Undo toast and rollback, §2.3),
   `useRestoreNote`, all over `@kn/apiclient` keys.
4. `src/features/notes/`: `markdown.ts` plus `NoteMarkdown.tsx` (§2.5), `format.ts`, `group.ts`,
   `share.ts` (`noteShareText`), and tests 30–33.
5. `src/features/home/`: `NoteList.tsx` (the `SectionList`, headers, rows, refresh, next page,
   loading, error and empty states, §2.1, §3, §3.1), `NoteRow.tsx` (the swipeable trash action,
   §2.2), and the long-press row menu. `HomeShell` hosts `NoteList` in place of the empty
   `ScrollView`, keeping `home-list`.
6. `app/notes/[id]/index.tsx`: the detail (§2.4) with its More menu, Copy and Share, and the
   loading, error, not-found and empty-body states.
7. `app/notes/[id]/attendees.tsx` (§2.6), `edit.tsx` (§2.7, with the discard menu and keyboard
   toggle), `rename.tsx` (§2.10), and their presentation options in the root `Stack`.
   `isPublicNativeRoute` stays false for `notes`.
8. Maestro: `subflows/open-home-as.yaml` (with `open-home.yaml` delegating to it), the eight flows
   `phase-4/notes-list.yaml`, `open-note.yaml`, `edit-note-body.yaml`, `edit-note-discard.yaml`,
   `rename-note.yaml`, `trash-by-swipe.yaml`, `trash-by-menu.yaml` and `empty-list.yaml`, and
   `phase-4/*` in `config.yaml`.
9. The visual check of the §8 screenshots against #01, #02, #03, #10, #11, #12, #16 and #31, per
   `docs/TESTING.md` §8. Gaps are fixed or recorded in `BLOCKERS.md`.
