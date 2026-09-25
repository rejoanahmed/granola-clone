# Phase 9 — Folders

A **folder** is a named set of the caller's notes. It is a folder in name only: a note can belong
to any number of folders, and adding it to one does not move it out of **My notes**, the unfiltered
home list. Folders are reached from a **left drawer** (#50). The drawer opens from home's folder
button or from a swipe off the screen's left edge. From the drawer the caller can create a folder
and pick one, and home then lists only that folder's notes. A note is added to a folder from the
**Add to folder** sheet (#17, #18). The sheet opens from the note page's folder+ button, and from
the third item of home's row menu (#02). A note leaves a folder from the row menu, while home is
showing that folder.

**Scoping is by construction, as everywhere else.** Every folder query filters on
`folders.owner_id = caller`. A membership can only be written between a folder and a note that the
caller both owns. A trashed note keeps its memberships, because trash is a soft delete, but it is
never listed or counted. Restoring the note brings it back into its folders.

Discovery saw only the empty states: the empty drawer (#50), the Add to folder sheet with no
folders (#17), and a sheet search with no results (#18). Creating a folder was denied as a write,
so none of these was ever seen: a folder row, a populated drawer, a populated sheet, the
create-folder UI, a filtered home, or removing or deleting anything. This spec designs them in the
language of the empty states, the home list (#01) and the rename sheet (phase 4), and marks each
one *(designed)*.

Screens: `#NN` is `~/personal/granola-clone-discovery/screens/NN-*/`. Tokens come from the discovery
README and `apps/native/src/design/tokens.ts`. Layout numbers are iOS points on the 428pt discovery
device. The clone runs at 402pt, so horizontal measurements are given relative to an edge or as a
fraction of the width. Discovery exposes `homeFoldersSidebar`, `homeFoldersSidebarCreate`,
`addToFolderSubmitButton` and so on. The clone uses its own `folders-*`, `folder-*` and
`add-to-folder-*` ids (§5), in the `<screen>-<thing>` form that every flow selects by.

---

## 1. Scope

| In | Out (and where it goes) |
| --- | --- |
| The folders drawer (#50): opened by `home-folders-button` or a left-edge swipe, closed by the scrim, a left swipe or picking a row | Folder sync from the desktop app. #50's copy says folders "appear here after they are synced". The copy is kept verbatim (§4), but there is no desktop app (phases.md, Out of scope) |
| The drawer's empty state (#50), and its populated state *(designed)*: a **My notes** row, then the folders with note counts, and **Create new folder** pinned at the bottom | Renaming a folder. There is no entry point in discovery, so it is recorded (§10) |
| Create a folder: a small sheet *(designed)* reached from the drawer and from the Add to folder sheet | Nested folders, folder icons or colours, sharing a folder |
| The Add to folder sheet (#17, #18): a searchable single-choice list, **Create folder**, and a disabled submit until a choice is made | Adding to folders from the live recording card (#102). `recording-add-to-folder` stays inert (§10) |
| Home's row menu (#02) gains **Add to folder**. In a folder view it also gains **Remove from folder** *(designed)*, with Undo | A new recording made in a folder view does **not** join that folder: it lands in My notes only (§10) |
| Home filtered by a folder *(designed)*: the folder name as the title, only its notes, its own empty state, and a return to My notes through the drawer | Remembering the chosen folder across a relaunch: home always opens on My notes |
| Deleting a folder *(designed)*: long-press a drawer row, then confirm on a sheet. Its notes stay in My notes | Folder-scoped Ask (chat): phase 7's scopes are global, note and person |
| API: `GET/POST /folders`, `DELETE /folders/{id}`, `POST /folders/{id}/notes`, `DELETE /folders/{id}/notes/{noteId}`, a `folder` filter on `GET /notes`, and `folderIds` on the note detail | Paging the folder list: it is capped at 100 folders per owner (§6.3) |

---

## 2. Journey

```
Home ── Folders button / left-edge swipe ──▶ Folders drawer (overlay, not a route)      #50
          │                                    │ scrim tap / swipe left ──▶ Home
          │                                    │ Create new folder ──▶ New folder sheet ──▶ drawer shows it
          │                                    │ folder row ──▶ Home filtered by that folder (drawer closes)
          │                                    │ My notes row ──▶ Home unfiltered (drawer closes)
          │                                    └ long-press folder row ──▶ menu: Delete folder ──▶ confirm sheet
          │ long-press row ──▶ row menu (#02): Edit title · Share notes · Add to folder
          │                                     (+ Remove from folder, in a folder view)
          └ tap row ──▶ Note page ── folder+ button ──▶ Add to folder sheet (modal)       #17
                                                      │ type ──▶ filtered list / No results   #18
                                                      │ Create folder ──▶ New folder sheet ──▶ back, new folder selected
                                                      │ pick a folder ──▶ "Add to folder" enabled
                                                      └ Add to folder ──▶ sheet closes, toast
```

The home row menu's **Add to folder** opens the same sheet for that note, over home.

---

## 3. Screens and states

### 3.1 The folders drawer (`folders-drawer`) — `features/folders/FoldersDrawer.tsx`

The drawer is an **overlay inside `HomeShell`**, not a route. It sits above the home content and
the bottom bar, and below any presented sheet (#50).

**Geometry** (#50):

- **Width.** The drawer is 336/428 of the screen width: 316pt on the 402pt clone. It is full
  height, from the top of the screen to the bottom, with the status bar drawn over it.
- **Fill and shape.** The fill is `bg.app` `#262626`. The top-right and bottom-right corners take
  `radii.sheet` (40). The left edge is square.
- **Scrim.** The home screen stays in place under a full-screen scrim `folders-drawer-scrim`
  (fill `bg.scrim`, a11y **"Dismiss folders"**, role button). #50 reads the dimmed home as about
  `#121212`. Discovery says the home is "pushed", but the shot shows it at its normal x, so the
  clone dims it and does not move it.
- **Motion.** The drawer opens with a 250 ms slide in from `-width`, and the scrim fades from 0 to
  1 at the same time. Closing reverses it.
- **Gestures.**
  - A pan that starts within 20pt of the screen's left edge on home opens the drawer. It tracks
    the finger, and opens if released past 40% of the width or with a rightward flick.
  - A leftward pan on the drawer or the scrim closes it, with the same thresholds.
  - A tap on the scrim closes it.
  - The pans are `react-native-gesture-handler` `Gesture.Pan()` with `activeOffsetX`, so a vertical
    list scroll is not captured.
  - The edge pan is disabled while any home sheet, the row menu or the mic card is up.
- **Accessibility.** The drawer is `accessibilityViewIsModal` while it is open, so VoiceOver stays
  inside it. The folder button's a11y label stays "Folders".

**Opening** also refetches `GET /folders`, with `refetchOnMount` of the drawer's query. The
previous data shows immediately.

**Empty state** `folders-empty` (#50), shown when the list answered `[]`:

- Top-aligned, not centred. It starts 32pt below the top safe area and is centred horizontally in
  the drawer:
  - a 44pt outline folder glyph (`Folder`, stroke 1.75, `text.secondary`) with a 20pt filled
    `text.secondary` disc holding a bare bold `?` (text, 14pt, `bg.app`, not a ringed glyph)
    overlapping its top-right corner, as #50 draws it;
  - 12pt below, **"No folders yet"** (`folders-empty-title`, `rowTitle` 17/22 semibold,
    `text.primary`);
  - 8pt below, **"Folders will appear here after they are synced."** (`folders-empty-body`,
    `secondary` 17/22, `text.secondary`, centred, max width 240, wrapping to two lines as in #50).
- There is no My notes row in this state: with no folders, home can only be My notes.

**Populated** `folders-list` *(designed)*, shown when there is at least one folder. It is a
`FlatList` from the top safe area plus 12pt, and it ends above the create row:

- The **My notes** row `folders-all`:
  - inset 12 on both sides, with height 52 and a 12pt corner radius;
  - leading 12, a 32pt rounded-square tile (radius 8, fill `bg.tileRaised` `#333333`, a 1pt
    hairline — `bg.tile` is too close to the drawer's `#262626` to read as a fill, and #50's tile is
    visibly lighter), holding an 18pt `NotebookPen` glyph in `text.primary`;
  - 12pt gap, then **"My notes"** at 17/22 semibold;
  - a11y "My notes", role button, `accessibilityState.selected` when home is unfiltered;
  - the selected fill is `bg.tileRaised` `#333333`, the same highlight a pressed list row takes.
- 20pt, then the section header **"Folders"** (`folders-section-title`): 15/20 regular in
  `text.secondary`, leading 24. 8pt below it, the first folder row.
- Each **folder row** is `folders-row-<folderId>`:
  - the same shape as the My notes row, with a `Folder` glyph in the tile;
  - the name (`folders-row-<folderId>-name`) at 17/22 semibold, one line, tail truncated;
  - trailing 16, the count (`folders-row-<folderId>-count`) at 15/20 `text.secondary`: **"No notes"**,
    **"1 note"** or **"<n> notes"**;
  - the a11y label is **"<name>, <count>"**. `selected` is set when it is home's current folder,
    and the row takes the selected fill;
  - rows are in the API's order: name, case-insensitive, then id.
- The list scrolls when it overflows. The create row does not scroll.

**Create new folder** `folders-create` (#50), in both states. It is pinned to the drawer's bottom,
16pt above the bottom safe-area inset:

- leading 16, a 32pt rounded-square tile (radius 8, fill `bg.tileRaised`, a hairline border) holding an
  18pt `FolderPlus` glyph in `text.primary`;
- 12pt gap, then **"Create new folder"** in `askLabel` 20/25 regular `text.primary`. #50's label is
  visibly larger than a row title;
- the whole row is a button (a11y "Create new folder") with `PRESSED_OPACITY` feedback.

Tapping it pushes `/folders/new` (§3.3). The drawer **stays open** under the sheet. When the sheet
closes, the new folder is in the drawer's list, because the create invalidates `folders.all`.

**Loading** `folders-loading` *(designed)*: this shows only on the first open, with no cached data.
It is a small `ActivityIndicator` in `text.secondary`, placed 48pt below the top safe area and
centred. The create row still shows and still works.

**Error** `folders-error` *(designed)*: the first fetch failed and there is no cached data. It sits
where the empty state sits: **"Couldn’t load your folders."** at `secondary` 17/22, centred, then
12pt below a dark `PillButton` **"Try again"** (`folders-retry`) that refetches. If a background
refetch fails with data in hand, the cached list stays and nothing changes.

**Picking a row.** Tapping `folders-all` or a folder row sets home's current folder (§3.2),
closes the drawer, and scrolls home's list to the top. Picking the row that is already current just
closes the drawer.

**The folder row menu** *(designed)*: a long-press on a folder row (not on My notes) opens the phase-2
`ActionMenu` (`folders-menu`), anchored to the row with its lifted preview. It has one entry:

- **"Delete folder"** (`folders-menu-delete`), with a `Trash2` glyph, `destructive`.

The menu's scrim closes it. The entry closes the menu and pushes `/folders/<id>/delete` (§3.4).

### 3.2 Home, filtered by a folder *(designed)* — `features/home/HomeShell.tsx`

**State.** Home's current folder is `{ id, name } | null`, held in `HomeShell` state. `null` means
My notes. It is not persisted: every launch opens on My notes. The drawer reads and sets it. A deep
link cannot select a folder.

**When a folder is current:**

- **Title.** The title `home-title` reads the folder's name, not "My notes". It keeps the same
  serif `display` 40/46, stays on one line and is tail-truncated. Its a11y role stays header.
- **Events card.** The upcoming-events card `home-events-card` is **not rendered**. It is about
  the calendar, not about a folder. The list's dark sheet then starts 24pt below the title rather
  than below the card, and the header band keeps its 40pt bottom padding.
- **Toolbar.** The toolbar is unchanged. The folder button still opens the drawer, and that is the
  way back to My notes.
- **List.** The list is `GET /notes?folder=<id>`: the same `NoteList`, the same day grouping, the
  same keyset paging, pull to refresh and swipe-to-trash, keyed `notes.list({ folder })` (§6.4).
  Trashing from a folder view removes the row with the usual Undo toast.
- **Row menu.** It gains a fourth entry, **"Remove from folder"**
  (`home-note-menu-remove-from-folder`), with a `FolderMinus` glyph in `text.primary` (not
  destructive: nothing is deleted). §3.5 describes it.
- **Bottom bar and FAB.** They are unchanged. A new recording lands in My notes only (§10).

**Folder view states:**

| State | When | What shows |
| --- | --- | --- |
| **Loading** | the first page for this folder, with nothing cached | Home's phase-4 skeleton `home-list-loading` |
| **Populated** | at least one live note | The rows, as on home |
| **Empty** `home-folder-empty` | the page is empty | The phase-4 empty layout (`home-empty`'s 56pt tile with radius 14 and its spacing), with a `Folder` glyph. The title **"No notes in this folder"** (`home-folder-empty-title`, `displaySheet`) and the body **"Add a note from its Add to folder button."** (`secondary`). `home-empty` itself is **not** shown: its copy talks about recording a first meeting |
| **Gone** `home-folder-gone` | `GET /notes?folder=` answered 404 `FolderNotFound`, for example because it was deleted on another device | The same empty layout, with a `FolderX` glyph and **"This folder no longer exists."**, then a dark `PillButton` **"Back to My notes"** (`home-folder-gone-back`), which sets the current folder to `null` |
| **Error** | any other failure | Home's phase-4 `home-list-error` and `home-list-retry`, unchanged |

**Staying consistent.** If a refetch of `GET /folders` no longer contains the current folder,
home clears it to My notes and shows the toast **"That folder no longer exists."** When the current
folder is renamed later (§10), or its count changes, the title keeps the name that was picked.
Deleting the current folder from the drawer (§3.4) returns home to My notes with no toast, because
the caller did it.

### 3.3 The new folder sheet (`folder-new-sheet`) *(designed)* — route `app/folders/new.tsx`

This is phase 4's rename sheet, re-titled. It uses the phase-2 `formSheet` presentation with
`SheetChrome fit`: the grabber, the title **"New folder"**, and the Close `x` on the right
(`folder-new-close`). It is presented over home when opened from the drawer, and over the Add to
folder sheet when opened from there.

- **The field.** `folder-new-input` is the phase-2 `TextField`. It has the placeholder
  **"Folder name"**, `autoFocus`, `maxLength` `FOLDER_NAME_MAX` (60), `autoCapitalize="words"`,
  `returnKeyType="done"`, and Return submits.
- **Create.** `folder-new-save` is a light `PillButton`, size `lg`, reading **"Create"**. It is
  disabled while the trimmed value is empty, and shows its spinner while the request is in flight.
  A second press while the request is pending does nothing.
- **Success.** `POST /folders` returns 201. The sheet then closes, `folders.all` is invalidated,
  and the created `Folder` is handed back through `features/folders/created.ts`. That module is a
  one-shot `takeCreated(): Folder | null`, which the Add to folder sheet reads on focus (§3.6). No
  toast is shown: the folder appears where the caller is looking.
- **Errors.** Each one is a `caption` in `destructive`, `folder-new-error`, 8pt under the field.
  The sheet stays open and the text is kept:
  - 409 `FolderNameTaken` → **"You already have a folder called “<trimmed name>”."**
  - 409 `FolderLimitReached` → **"You’ve reached the limit of 100 folders."**
  - anything else → **"Couldn’t create this folder. Try again."**
  - Editing the field clears the error.

### 3.4 The delete folder sheet (`folder-delete-sheet`) *(designed)* — route `app/folders/[id]/delete.tsx`

This uses the phase-2 `formSheet` with `SheetChrome fit`: the title **"Delete folder?"** and the
Close `x` (`folder-delete-close`). The route reads the name from the cached `GET /folders` data.
If the id is not in the cache, the sheet closes at once.

- **Body.** `folder-delete-body`, `secondary` 17/22 at leading and trailing 20:
  **"“<name>” will be deleted. Its notes stay in My notes."**
- **Confirm.** 20pt below, `folder-delete-confirm`: a `PillButton` size `lg` in a new
  **`destructive` tone** (fill `destructive` `#FE4346`, label `text.primary`) reading
  **"Delete folder"**. It shows a spinner while the request is pending. The tone is added to
  `PillButton` and to the dev gallery.
- **Success.** `DELETE /folders/{id}` returns 204. The sheet closes, and `folders.all` and
  `notes.list()` are invalidated. If that folder was home's current one, home returns to My notes.
  The toast reads **"Folder deleted"**, with no Undo.
- **404 `FolderNotFound`** (it is already gone) is treated as success.
- **Other errors** show `folder-delete-error`, a destructive `caption` reading
  **"Couldn’t delete this folder. Try again."**, and the sheet stays open.

### 3.5 The home row menu (#02) — changes

The menu is phase 4's `home-note-menu`. The entries, in #02's order:

1. **Edit title** (`home-note-menu-edit-title`), unchanged.
2. **Share notes** (`home-note-menu-share`), unchanged.
3. **Add to folder** (`home-note-menu-add-to-folder`), with a `FolderPlus` glyph. This entry is
   new, and is the third item #02 shows. It closes the menu and pushes `/notes/<id>/folder` (§3.6)
   over home. The comment in `HomeShell.tsx` about this entry waiting for phase 9 is removed.
4. **Remove from folder** (`home-note-menu-remove-from-folder`), shown **only** in a folder view
   *(designed)*. It closes the menu and sends `DELETE /folders/{id}/notes/{noteId}`. The update is
   optimistic: the row leaves the folder's list at once, and the day header goes with it if it was
   the day's only row. Then:
   - The toast reads **"Removed from “<folder name>”"**, with the action **"Undo"**
     (`toast-action`). Undo sends `POST /folders/{id}/notes { noteId }` and the row returns.
   - On failure, the row is restored and the toast reads **"Couldn’t remove this note. Try again."**
   - `notes.list()`, `folders.all` and `notes.detail(noteId)` are invalidated either way.

### 3.6 The Add to folder sheet (`add-to-folder-sheet`) — route `app/notes/[id]/folder.tsx`

The sheet has `presentation: "modal"`: the full-height page sheet with the dimmed stack behind it,
which NAVIGATION.md lists as a modal with an x close (#17). It is presented from the note page
(`note-add-to-folder`, which until now did nothing) and from the home row menu. The fill is
`bg.app` `#262626`. Swipe-down dismisses it, as Close does.

**Data.** The sheet reads two things:

- `GET /folders`, the list;
- the note's `folderIds`, from `GET /notes/{id}`: the cached detail if it is there, fetched
  otherwise.

A folder is **Added** when its id is in `folderIds`. The sheet's state is
`selected: FolderId | null` and `query: string`.

**Top bar** (#17). This sits 16pt below the sheet's top edge, with 16pt side insets:

- **Close** (`add-to-folder-close`, a11y "Close"): a 44pt circle holding an `X` glyph, with fill
  `bg.iconButton` and a hairline border, leading.
- **Add to folder** (`add-to-folder-submit`), trailing: a `PillButton` of height 44, reading
  **"Add to folder"** at 17/22 medium.
  - Disabled (#17): fill `#555555` at 100%, with the label in `text.tertiary`. That needs a new
    `button.disabled` token for `#555555`. `accessibilityState.disabled` is set.
  - Enabled *(designed)*: the `light` tone, fill `button.light` `#EAEBE4` with the label in
    `text.onLight`.
  - Loading: the pill's spinner.
  - It is enabled exactly when `selected !== null` and no submit is pending. It stays disabled
    through search, as #18 shows.

**Body states.** The body lies between the top bar and the search field:

| State | When | What shows |
| --- | --- | --- |
| **Loading** `add-to-folder-loading` *(designed)* | either query has no data yet | A centred `ActivityIndicator` in `text.secondary` |
| **Empty** `add-to-folder-empty` (#17) | the caller has no folders and the query is empty | Centred vertically in the body: a 44pt circle (fill `bg.tileRaised`, a hairline border) holding a 22pt `Plus` in `text.primary`, then 12pt, then **"Create folder"** at `body` 17/22 `text.primary`. The circle and the label are one button, `add-to-folder-empty-create` (a11y "Create folder") |
| **List** `add-to-folder-list` *(designed)* | at least one folder matches | The create row, then the matching folders (below) |
| **No results** `add-to-folder-no-results` (#18) | the trimmed query is not empty and nothing matches | **Top-aligned**, 150pt below the top bar, centred: the `HomeNotesEmptyState`-style illustration, drawn as a 48pt two-sheet stack in perspective with a small `+` at its top-right (a custom SVG in `text.tertiary`, stroke 1.25: no icon set draws #18's glyph). 12pt below it, **"No results for “<q>”"** (`add-to-folder-no-results-text`, `secondary` 17/22, `text.secondary`, one line, middle-truncated), where `<q>` is the trimmed query in curly quotes |
| **Error** `add-to-folder-error` *(designed)* | a query failed with no data | Centred: **"Couldn’t load your folders."** (`secondary`), then 12pt, then a dark `PillButton` **"Try again"** (`add-to-folder-retry`), which refetches both |

**The list** *(designed)*. It scrolls, with `keyboardShouldPersistTaps="handled"` and
`keyboardDismissMode="on-drag"`. It starts 16pt below the top bar:

- **The create row.** `add-to-folder-create` (a11y "Create folder") comes first, and only while
  the query is empty.
  - leading 16: the 44pt circle from the empty state, holding a `Plus`;
  - 12pt gap, then **"Create folder"** at `body` 17/22;
  - height 60.
- **Folder rows.** One `add-to-folder-row-<folderId>` per folder:
  - leading 16, a 44pt tile (radius 10, fill `bg.tile`, a hairline border), which is home's row
    tile, holding a 22pt `Folder` glyph;
  - 12pt gap, then the name (`add-to-folder-row-<folderId>-name`) at `rowTitle` 17/22, one line,
    tail truncated;
  - below it, the count at `caption` 15/20 `text.secondary` ("No notes", "1 note", "<n> notes");
  - trailing 20, a 24pt **choice circle**:
    - unselected: a 1.5pt ring in `text.tertiary`;
    - selected: filled `accent.lime` `#B0BF40`, with a 14pt `Check` in `text.onLight` at stroke
      2.25;
    - Added: filled `bg.tileRaised`, with the `Check` in `text.secondary`;
  - height 60.
  - The a11y label is **"<name>, <count>"**, plus **", added"** when the note is already in the
    folder. The role is radio, and `accessibilityState` is `{ selected }` or `{ disabled: true }`.
- **Tapping a row.** It selects that folder. Tapping the selected row clears the selection.
  Rows that show Added are disabled: the note is already in that folder, and removing it is done
  from the folder view (§3.5).
- **Order.** Rows are in the API's order. Filtering never reorders them.

**The search field** (#17, #18) is the phase-8 docked search field, generalised into a shared
`design/SearchBar.tsx` that phase 8's `SearchField` then uses:

- The pill `add-to-folder-search` sits at leading and trailing 16, is 48 high, and has fill
  `bg.list` `#1A1A1A` with no border (#17 shows none).
  - a 20pt magnifier in `text.secondary`, 20pt in from the pill's edge;
  - the input `add-to-folder-search-input`, with the placeholder **"Search folders"** in
    `text.tertiary`, `returnKeyType="search"`, and autocorrect off. Return blurs it.
- With no keyboard, the pill sits 12pt above the bottom safe-area inset (#17).
- With the keyboard up, it rides 12pt above the keyboard. The pill then shrinks to make room for
  the 48pt circular **Hide keyboard** button `add-to-folder-keyboard-dismiss` (a11y
  "Hide keyboard", a `Keyboard` glyph with a chevron, `bg.iconButton` and a hairline border),
  9pt to its right, trailing 16 (#18). The button blurs the input and disappears with the keyboard.
- The input is **not** autofocused. #17 opens with the keyboard down.
- **Filtering** is done on the client, with no request: a case-insensitive substring match of the
  trimmed query on the name, using `toLocaleLowerCase()`. It updates on every keystroke. A
  selection that the filter hides stays selected, which is why submit stays enabled.

**Create from the sheet.** `add-to-folder-empty-create` and `add-to-folder-create` push
`/folders/new` (§3.3). On the sheet's next focus, `takeCreated()` returns the new folder and the
sheet selects it. The list already holds the folder, because the create invalidated `folders.all`,
so submit is enabled. The query is cleared first, so the selected row is on screen.

**Submit.** This sends `POST /folders/{selected}/notes { noteId }`.

- **200.** The sheet closes and the toast reads **"Added to “<folder name>”"**. `notes.detail(id)`,
  `notes.list()` and `folders.all` are invalidated.
- **404 `FolderNotFound`** (deleted elsewhere). The selection clears, `folders.all` is refetched,
  the sheet stays open, and the toast reads **"That folder no longer exists."**
- **404 `NoteNotFound`, or 409 `NoteTrashed`.** The note was trashed or deleted since the sheet
  opened. The sheet dismisses to home, and the toast shows phase 4's `GONE_FOR_EDITING`.
- **Anything else.** The sheet stays open, the selection is kept, and the toast reads
  **"Couldn’t add this note. Try again."**

**Close** (`add-to-folder-close`) or a swipe-down dismisses the sheet with no write and no prompt.

### 3.7 The note page — changes

`note-add-to-folder` (phase 4's folder+ button, until now inert) pushes `/notes/<id>/folder`. Its
look and a11y label ("Add to folder") are unchanged. Discovery shows no folder indicator on a note
that is in folders, so the page shows none.

---

## 4. Copy

Every string is verbatim from COPY.md, or marked *(designed)*. **No string in this phase names the
product**, so nothing needed "Granola" replaced with "Notes". #50's sync sentence is kept word for
word, although nothing in the clone syncs (§1).

| Where | String |
| --- | --- |
| Drawer empty (#50) | No folders yet · Folders will appear here after they are synced. |
| Drawer create (#50) | Create new folder |
| Drawer a11y (#50) | Dismiss folders · Folders |
| Drawer populated *(designed)* | My notes · Folders · No notes · 1 note · <n> notes |
| Drawer error *(designed)* | Couldn’t load your folders. · Try again |
| Folder row menu *(designed)* | Delete folder |
| Row menu (#02) | Edit title · Share notes · Add to folder |
| Row menu, folder view *(designed)* | Remove from folder |
| Remove toasts *(designed)* | Removed from “<name>” · Undo · Couldn’t remove this note. Try again. |
| Add to folder sheet (#17, #18) | Add to folder · Create folder · Search folders · No results for “<q>” |
| Add to folder a11y (#17, #18) | Close · Hide keyboard · "<name>, <count>" · "<name>, <count>, added" *(designed)* |
| Add to folder toasts *(designed)* | Added to “<name>” · That folder no longer exists. · Couldn’t add this note. Try again. |
| Add to folder error *(designed)* | Couldn’t load your folders. · Try again |
| New folder sheet *(designed)* | New folder · Folder name · Create |
| New folder errors *(designed)* | You already have a folder called “<name>”. · You’ve reached the limit of 100 folders. · Couldn’t create this folder. Try again. |
| Delete sheet *(designed)* | Delete folder? · “<name>” will be deleted. Its notes stay in My notes. · Delete folder · Folder deleted · Couldn’t delete this folder. Try again. |
| Folder view *(designed)* | No notes in this folder · Add a note from its Add to folder button. · This folder no longer exists. · Back to My notes |

Apostrophes and quotes are typographic (`’`, `“`, `”`). The strings live in
`features/folders/copy.ts`, and the count caption comes from the pure `formatNoteCount(n)` there.

---

## 5. testIDs

| Screen | testIDs |
| --- | --- |
| Drawer | `folders-drawer`, `folders-drawer-scrim`, `folders-loading`, `folders-error`, `folders-retry`, `folders-empty`, `folders-empty-title`, `folders-empty-body`, `folders-list`, `folders-all`, `folders-section-title`, `folders-row-<folderId>`, `folders-row-<folderId>-name`, `folders-row-<folderId>-count`, `folders-create`, `folders-menu`, `folders-menu-delete` |
| Home (new or changed) | `home-title` (reads the folder name in a folder view), `home-folder-empty`, `home-folder-empty-title`, `home-folder-gone`, `home-folder-gone-back`, `home-note-menu-add-to-folder`, `home-note-menu-remove-from-folder` |
| New folder sheet | `folder-new-sheet`, `folder-new-sheet-grabber`, `folder-new-close`, `folder-new-input`, `folder-new-save`, `folder-new-error` |
| Delete folder sheet | `folder-delete-sheet`, `folder-delete-close`, `folder-delete-body`, `folder-delete-confirm`, `folder-delete-error` |
| Add to folder sheet | `add-to-folder-sheet`, `add-to-folder-close`, `add-to-folder-submit`, `add-to-folder-loading`, `add-to-folder-error`, `add-to-folder-retry`, `add-to-folder-empty`, `add-to-folder-empty-create`, `add-to-folder-list`, `add-to-folder-create`, `add-to-folder-row-<folderId>`, `add-to-folder-row-<folderId>-name`, `add-to-folder-search`, `add-to-folder-search-input`, `add-to-folder-keyboard-dismiss`, `add-to-folder-no-results`, `add-to-folder-no-results-text` |
| Unchanged, reused | `home-folders-button`, `home-screen`, `home-note-<noteId>`, `home-note-menu`, `home-note-menu-edit-title`, `home-note-menu-share`, `home-list-loading`, `note-screen`, `note-add-to-folder`, `note-back`, `toast`, `toast-message`, `toast-action`, `action-menu-scrim` |

Like the phase-8 rows, a folder row and a sheet row are **one accessibility element** each. Their
inner `-name` and `-count` ids are in the render tree but hidden from XCUITest, so flows assert the
row id against its label ("Product, 2 notes"). A Maestro id is a regex, and every folder id is
`fld_` plus `[A-Za-z0-9_-]`, which is safe. A flow reaches a folder it created, which has an id it
cannot know, through the label: `id: "folders-row-.*", text: "Research, .*"`.

---

## 6. API

### 6.1 Routes

All routes are in `packages/domain/src/Folders/Contract.ts` under the tag `Folders`, except the two
changes to Notes. All are session-authenticated, and every handler is one expression (R6).

| Route | Request | Success | Errors |
| --- | --- | --- | --- |
| `GET /folders` — `listFoldersRoute` | — | 200 `FolderList` `{ items: Folder[] }`, the caller's folders ordered by `name_key asc, id asc` | 401 |
| `POST /folders` — `createFolderRoute` | body `FolderCreate` `{ name }` | 201 `Folder`, with `noteCount: 0` | 401; 409 `FolderNameTaken` (the same `nameKey` as a folder the caller has); 409 `FolderLimitReached` (the caller has 100); 422 (blank after trimming, over 60, or an extra key) |
| `DELETE /folders/{id}` — `deleteFolderRoute` | path `id: FolderId` | 204, no body. Memberships go with it (FK cascade). The notes are untouched | 401; 404 `FolderNotFound` (absent, or not the caller's: the two are indistinguishable); 422 on a malformed id |
| `POST /folders/{id}/notes` — `addFolderNoteRoute` | path `id`; body `FolderNoteAdd` `{ noteId: NoteId }` (strict) | 200 `Folder`, with the new `noteCount`. **Idempotent**: adding a member again is a 200 no-op that keeps its first `addedAt` | 401; 404 `FolderNotFound`; 404 `NoteNotFound` (absent or not the caller's); 409 `NoteTrashed`; 422 |
| `DELETE /folders/{id}/notes/{noteId}` — `removeFolderNoteRoute` | path `id`, `noteId` | 200 `Folder`, with the new `noteCount`. **Idempotent**: a non-member is a 200 no-op. A trashed note can be removed | 401; 404 `FolderNotFound`; 404 `NoteNotFound`; 422 |
| `GET /notes?folder=` — `listNotesRoute`, extended | `NoteListQuery` gains an optional `folder: FolderId`. It combines with `person` as AND | 200 `Page<NoteSummary>`: the caller's live notes in that folder, in the list's order (`startedAt desc, id desc`), with the same cursor | 401; **404 `FolderNotFound`**. Unlike an unknown person (phase 8), a folder is an entity the caller can lose, and the client draws a "gone" state for it. 422 on a malformed id or cursor |
| `GET /notes/{id}` — `getNoteRoute`, extended | — | `Note` gains `folderIds: FolderId[]`: the caller's folders holding this note, sorted by id | unchanged |

Check order in `addNote`: the folder first, then the note, then trash. So a foreign folder with a
foreign note is `FolderNotFound`, and never reveals anything about the note.

### 6.2 Shapes

```ts
// packages/domain/src/Domain/Folder.ts
export const FolderId = branded("FolderId", "fld_");
export const FOLDER_NAME_MAX = 60;
export const FOLDERS_PER_OWNER_MAX = 100;
export const FolderName = z.string().trim().min(1).max(FOLDER_NAME_MAX);
// Trimmed, inner whitespace collapsed to one space, then toLocaleLowerCase("en-US").
// Pure and unit-tested. What uniqueness and ordering compare, so "Product" and " product " clash.
export const folderNameKey = (name: string): string;
export const Folder = z.object({
  createdAt: Timestamp,
  id: FolderId,
  name: FolderName,             // as typed, trimmed; inner whitespace collapsed
  noteCount: z.number().int().min(0),   // live (untrashed) member notes only
  updatedAt: Timestamp,         // moves on create, and on each add or remove that changed a row
});
export const FolderList = z.object({ items: z.array(Folder) });
export const FolderCreate = z.strictObject({ name: FolderName });
export const FolderNoteAdd = z.strictObject({ noteId: NoteId });

// packages/domain/src/Folders/Errors.ts
export class FolderNotFound extends appError("FolderNotFound", 404) {}
export class FolderNameTaken extends appError("FolderNameTaken", 409) {}
export class FolderLimitReached extends appError("FolderLimitReached", 409) {}

// packages/domain/src/Domain/Note.ts
Note = Note.extend({ folderIds: z.array(FolderId) })        // detail only; NoteSummary unchanged

// packages/domain/src/Notes/Contract.ts
NoteListQuery = PageQuery.extend({ folder: FolderId.optional(), person: PersonKey.optional() })
```

`FolderId` lives in `Domain/Ids.ts` next to `NoteId`, because `Note.ts` needs it and `Folder.ts`
needs `NoteId`. That is the same cycle `Ids.ts` already breaks for recordings.

### 6.3 Storage and rules

**Tables** (`packages/db/src/schema/folders.ts`, keys alphabetical, epoch-ms integers), with the
migration `0008_folders.sql` from `db:generate`:

```
folders
  createdAt   created_at  integer not null
  id          id          text primary key                      -- fld_<nanoid16>
  name        name        text not null
  nameKey     name_key    text not null                         -- folderNameKey(name), written by the repo from the service's value
  ownerId     owner_id    text not null references user(id) on delete cascade
  updatedAt   updated_at  integer not null
  unique index folders_owner_name_key_uq on (owner_id, name_key)
    -- also serves the list's order

folder_notes
  addedAt     added_at    integer not null
  folderId    folder_id   text not null references folders(id) on delete cascade
  noteId      note_id     text not null references notes(id) on delete cascade
  primary key (folder_id, note_id)
  index folder_notes_note_idx on (note_id)
    -- the note detail's folderIds and the list filter's exists()
```

`RESET_ORDER` gains `folderNotes` and then `folders`, at the head of the list: `folderNotes`
references both `folders` and `notes`.

**Rules** (the service, with the repository doing only I/O, R2):

- **Create.**
  - The service computes `nameKey` with `folderNameKey`, stores the name trimmed with its inner
    whitespace collapsed, mints `fld_` from `ids`, and reads `now` from `clock`.
  - It counts the owner's folders first, and at 100 raises `FolderLimitReached`.
  - A unique-constraint violation on `folders_owner_name_key_uq` is mapped in the repo to a typed
    `"name-taken"` result, which the service raises as `FolderNameTaken`. The service does not
    check-then-insert, so two concurrent creates cannot both succeed.
- **List.** Each row's `noteCount` is
  `count(folder_notes join notes on notes.trashed_at is null)`, computed in the list query with a
  left join and a group by, never with a query per folder.
- **Add.** The folder must be the caller's (`FolderNotFound`), the note must be the caller's
  (`NoteNotFound`), and the note must not be trashed (`NoteTrashed`). Then
  `insert … on conflict do nothing`. The folder's `updatedAt` moves only when a row was inserted.
  The response is the folder, with the count re-read.
- **Remove.** Folder, then note ownership, then `delete`. `updatedAt` moves only when a row was
  deleted. The response is the folder.
- **Delete.** The service checks ownership and deletes the folder, and FK cascade removes the
  memberships. This needs `foreign_keys` on, which D1 enforces. The repo also deletes
  `folder_notes` explicitly first, so the test D1 does not depend on the pragma.
- **Filter.** `NotesService.list(actor, { folder })` first asks
  `FoldersRepo.findForOwner(ownerId, folderId)`, which it names as a type-only dependency, and
  raises `FolderNotFound` on `null`. `NotesRepo.listLive` then adds
  `exists (select 1 from folder_notes fn where fn.note_id = notes.id and fn.folder_id = ?)`. The
  keyset and the partial index are unchanged.
- **Note detail.** `NotesRepo` reads the note's `folder_notes` rows, joined to
  `folders.owner_id = caller`, as `folderIds`. Today the join is redundant, because only the owner
  writes, but it keeps the answer correct once sharing exists.
- **Trash and restore** do not touch memberships. A trashed member leaves its folder's
  `noteCount` and list, and restoring it brings it back.
- **Contexts.** `Folders/` follows the ten-step shape: `FoldersRepo`, `Policy`
  (`canManageFolder(actor, folder)` returns `Authorized<Folder>`), `FoldersService`, `Http`, and
  both test files. It is wired under `traced()` in `container.ts`, and `apps/api` mounts it and adds
  the `Folders` OpenAPI tag. `FolderNotFound`, `FolderNameTaken` and `FolderLimitReached` map
  through `on-error.ts`, which is the error classes' status, as for every other error (R7).

### 6.4 Client (`packages/apiclient`)

- **`folders.ts`** holds `listFolders`, `createFolder`, `deleteFolder`, `addFolderNote` and
  `removeFolderNote`, each as `endpoint<typeof …Route>`. `notes.ts`'s `listNotes` accepts
  `{ folder }`.
- **Query keys.**
  - `folders: { all: ["folders"], list: () => ["folders", "list"] }`.
  - `notes.list(filter?: { person?: string; folder?: string })` puts the filter object in the key
    only when it is present, and orders the object's keys so that the same filter is always the
    same key. `notes.list()` stays home's key and the prefix of every filtered list.
- **Invalidation keys.**
  - `createFolder: () => [folders.all]`.
  - `deleteFolder: () => [folders.all, notes.list()]`.
  - `addFolderNote` / `removeFolderNote: (noteId) => [folders.all, notes.list(), notes.detail(noteId)]`.
  - `trashNote` and `restoreNote` also name `folders.all`, because a trash changes a count.

### 6.5 Seed

The **base seed does not change for `person`**: they have **no folders**, so #50's and #17's empty
states are reachable as the ordinary signed-in user, and no earlier flow sees a folder.
The base seed gains one folder for `other`, so that ownership can be proven:

| Folder | Owner | Members |
| --- | --- | --- |
| `fld_e2e_other` "Other’s folder" | other | `not_e2e_other` |

A new harness route, **`POST /e2e/folders`**, seeds `person`'s folders on demand. It sits behind
the same secret, like `/e2e/llm`, and is not in the OpenAPI document. It is idempotent, and it
writes:

| Folder | Members (as seeded) | Live count |
| --- | --- | --- |
| `fld_e2e_personal` "Personal" | `not_e2e_solo` | 1 |
| `fld_e2e_product` "Product" | `not_e2e_launch`, `not_e2e_standup`, `not_e2e_archived` (trashed) | 2 |

The drawer order is Personal, then Product. The fixtures go in `E2E/Fixtures.ts` as `E2E_FOLDERS`,
and the writes in `E2eRepo`/`E2eService`. `createdAt` and `addedAt` are fixed instants, never now.
Maestro calls the route through `scripts/e2e-folders.js` and `subflows/seed-folders.yaml`, run
**after** `open-home.yaml`'s reset and **before** the drawer is first opened. The flow then
refreshes by opening the drawer, whose query fetches on open (§3.1).

---

## 7. API test cases

`Folders/Folders.test.ts`, which builds the service over `makeTestD1()` with `fixedClock` and
`sequentialIds`, and seeds through the E2E fixtures:

1. **Create.** `" Product  Ideas "` → 201 with the name `"Product Ideas"`, `noteCount: 0`, an id
   starting `fld_`, and `createdAt === updatedAt === clock`.
2. **Unique per owner, case-insensitively.** After "Product", both "product" and " PRODUCT " raise
   `FolderNameTaken`. `other` may still create "Product".
3. **Limit.** The 101st create raises `FolderLimitReached`. After one delete, a create succeeds.
4. **List order and counts.** Personal (1) comes before Product (2). The trashed archived note is
   not counted. `other`'s folder is never listed to `person`, and `empty` lists `[]`.
5. **Add.**
   - Adding standup to Personal gives `noteCount` 2, and `updatedAt` moves.
   - Adding it again gives 200, the same count, and `updatedAt` does not move.
   - The note detail's `folderIds` for standup is `[fld_e2e_personal, fld_e2e_product]`.
6. **Add refusals.**
   - A foreign folder with an own note, and an unknown folder: `FolderNotFound`.
   - An own folder with `other`'s note, and an unknown note: `NoteNotFound`.
   - An own folder with the archived (trashed) note: `NoteTrashed`.
   - A foreign folder with a foreign note: `FolderNotFound`.
7. **Remove.**
   - Removing launch from Product gives count 1.
   - Removing it again gives 200 and count 1, and `updatedAt` does not move.
   - Removing the trashed archived note succeeds, and a later restore does not bring it back.
   - A foreign folder raises `FolderNotFound`.
8. **Delete.** Deleting Product leaves launch, standup and archived untouched. Their `folderIds` no
   longer hold it. A second delete, and a delete of `other`'s folder, raise `FolderNotFound`.
9. **Trash and restore.** Trashing launch drops Product's count to 1 and drops it from the filtered
   list. Restoring puts both back.
10. **`folderNameKey`** (in `Domain/Folder.test.ts`): trims, collapses inner whitespace, and
    lower-cases, "Élan" included (`toLocaleLowerCase` is not ASCII-only). `FolderName` rejects
    `"   "` and 61 characters.

`Notes/Notes.test.ts` (extended):

11. `list(person, { folder: fld_e2e_product })` → `[launch, standup]`, with archived excluded.
    `limit 1` pages launch → standup, and `nextCursor` is `null` on the last page.
12. `{ folder, person: "email:priya@example.com" }` → `[launch]`.
13. An unknown folder, and `other`'s folder, each raise `FolderNotFound`.
14. The note detail carries `folderIds: []` for a note in no folder.

`E2E/E2E.test.ts`: `POST /e2e/folders` writes the §6.5 rows, a second call changes nothing, and
the base seed gives `person` zero folders and `other` one.

The HTTP suites cover wire shape, not rules:

- `Folders/Folders.http.test.ts`:
  - `GET` answers 200 and parses as `FolderList`, and 401 without a session;
  - `POST` answers 201 and parses as `Folder`; 422 on `{}`, on `{ name: " " }`, on 61 characters,
    and on `{ name, extra }`; and 409 on a duplicate, with the error body naming
    `FolderNameTaken`;
  - `DELETE /folders/{id}` answers 204 with an empty body, 404 `FolderNotFound`, and 422 on
    `not-a-folder`;
  - `POST …/notes` answers 200 `Folder`, 404 `NoteNotFound`, 409 `NoteTrashed`, and 422 on an
    extra key;
  - `DELETE …/notes/{noteId}` answers 200.
- `Notes/Notes.http.test.ts`: `?folder=fld_e2e_product` → 200. `?folder=bad` → 422. An unknown
  `fld_…` → 404 `FolderNotFound`. `GET /notes/{id}` parses with `folderIds`.
- `apps/api` `app.test.ts`: `/folders` is mounted and appears in the OpenAPI document under
  `Folders`, and the three new errors map to 404/409/409.

---

## 8. Acceptance criteria and flows

**Flow setup.**

- Every flow starts from `clearState`, `clearKeychain` and reset/seed, and signs in fast as `person`
  through `subflows/open-home.yaml`.
- Flows marked **[folders]** then run `subflows/seed-folders.yaml`.
- The tags are `phase-9` and `regression`. `folder-journey.yaml` is also tagged `smoke`, because it
  is the phase's exit journey.
- Flows select by `id`, and text is asserted only as a property of an id. There is no `sleep`:
  every wait is `extendedWaitUntil`.
- `config.yaml` gains `phase-9/*`.

**New Maestro pieces:**

- `subflows/open-folders.yaml`: taps `home-folders-button`, then waits for `folders-drawer` and
  for `folders-loading` to be gone.
- `subflows/seed-folders.yaml` and `scripts/e2e-folders.js`: `POST /e2e/folders`.
- `subflows/open-add-to-folder.yaml` (`NOTE_ID`): runs `open-note.yaml`, taps
  `note-add-to-folder`, then waits for `add-to-folder-sheet` and for `add-to-folder-loading` to be
  gone.

**Gestures.** The edge swipe is
`swipe: { start: "1%,50%", end: "75%,50%", duration: 400 }`. That is a gesture, not a selector,
so the testID-only rule holds. The close swipe is the reverse, starting on the drawer.

| # | Given / When / Then | Flow |
| --- | --- | --- |
| AC1 | **Given** `person` (no folders) on home, **when** they tap `home-folders-button`, **then** `folders-drawer` shows `folders-empty-title` "No folders yet", `folders-empty-body` "Folders will appear here after they are synced.", and `folders-create` "Create new folder"; there is no `folders-all`. **When** they tap `folders-drawer-scrim` (at its right-hand part, outside the drawer), **then** the drawer is gone and `home-screen` is unobstructed. **When** they swipe right from the left edge, **then** `folders-drawer` is visible again. **When** they swipe left across it, **then** it is gone. | `apps/native/.maestro/phase-9/folders-empty.yaml` |
| AC2 | **Given** the empty drawer is open, **when** they tap `folders-create`, **then** `folder-new-sheet` shows `folder-new-input` focused and `folder-new-save` disabled. **When** they type "   ", **then** save stays disabled. **When** they clear it, type "Research" and tap save, **then** the sheet closes, `folders-drawer` is still open, it shows `folders-all` ("My notes"), and a `folders-row-.*` reads "Research, No notes". **When** they tap `folders-create` again, type "research" and save, **then** `folder-new-error` reads "You already have a folder called “research”." and the sheet stays open. **When** they tap `folder-new-close`, **then** the drawer still has exactly one folder row. | `apps/native/.maestro/phase-9/folder-create.yaml` |
| AC3 | **Given** `person` (no folders) opens `not_e2e_launch`, **when** they tap `note-add-to-folder`, **then** `add-to-folder-sheet` shows `add-to-folder-close`, `add-to-folder-submit` "Add to folder" with `enabled: false`, `add-to-folder-empty-create` "Create folder", and `add-to-folder-search` with no `add-to-folder-keyboard-dismiss`. **When** they tap `add-to-folder-search-input` and type "pro", **then** `add-to-folder-no-results-text` reads "No results for “pro”", `add-to-folder-keyboard-dismiss` is visible, and submit is still disabled. **When** they tap `add-to-folder-keyboard-dismiss`, **then** it is gone. **When** they tap `add-to-folder-close`, **then** `note-screen` is visible. | `apps/native/.maestro/phase-9/add-to-folder-empty.yaml` |
| AC4 — **exit journey** | **Given** `person` (no folders) opens `not_e2e_launch` and taps `note-add-to-folder`, **when** they tap `add-to-folder-empty-create`, type "Research" and tap `folder-new-save`, **then** `add-to-folder-sheet` shows a row labelled "Research, No notes" as selected, and `add-to-folder-submit` is enabled. **When** they tap submit, **then** the sheet closes and `toast-message` reads "Added to “Research”". **When** they go back home and open the drawer, **then** the Research row reads "Research, 1 note". **When** they tap it, **then** the drawer closes, `home-title` reads "Research", `home-note-not_e2e_launch` is visible, `home-note-not_e2e_standup` and `home-note-not_e2e_solo` are not, and `home-events-card` is not. **When** they long-press `home-note-not_e2e_launch`, **then** `home-note-menu` shows `home-note-menu-add-to-folder` and `home-note-menu-remove-from-folder`. **When** they tap Remove, **then** the row is gone, `home-folder-empty-title` reads "No notes in this folder", and `toast-message` reads "Removed from “Research”". **When** they open the drawer and tap `folders-all`, **then** `home-title` reads "My notes" and `home-note-not_e2e_launch` is visible again. | `apps/native/.maestro/phase-9/folder-journey.yaml` |
| AC5 | **Given** [folders], **when** they long-press `home-note-not_e2e_standup` and tap `home-note-menu-add-to-folder`, **then** `add-to-folder-sheet` shows `add-to-folder-create`, `add-to-folder-row-fld_e2e_personal` "Personal, 1 note" above `add-to-folder-row-fld_e2e_product`, which reads "Product, 2 notes, added", and there is no `add-to-folder-row-fld_e2e_other`. **When** they tap the Product row, **then** submit stays disabled. **When** they tap Personal, **then** submit is enabled. **When** they tap Personal again, **then** it is disabled. **When** they tap Personal and submit, **then** `toast-message` reads "Added to “Personal”", and the drawer's `folders-row-fld_e2e_personal` reads "Personal, 2 notes". | `apps/native/.maestro/phase-9/add-from-row-menu.yaml` |
| AC6 | **Given** [folders] and the Add to folder sheet open on `not_e2e_solo`, **when** they type "pro", **then** only `add-to-folder-row-fld_e2e_product` is listed, and there is no `add-to-folder-create`. **When** they tap it, then replace the query with "per", **then** only Personal is listed ("Personal, 1 note, added", solo being in it) and submit is **still enabled**, because the hidden Product stays selected. **When** they replace it with "zz", **then** `add-to-folder-no-results-text` reads "No results for “zz”". **When** they clear the query and submit, **then** `toast-message` reads "Added to “Product”". | `apps/native/.maestro/phase-9/add-to-folder-search.yaml` |
| AC7 | **Given** [folders], **when** they open the drawer, **then** `folders-all` is selected, `folders-section-title` reads "Folders", `folders-row-fld_e2e_personal` "Personal, 1 note" is above `folders-row-fld_e2e_product` "Product, 2 notes", and there is no `folders-row-fld_e2e_other`. **When** they tap Product, **then** `home-title` reads "Product", `home-note-not_e2e_launch` and `home-note-not_e2e_standup` are visible, `home-note-not_e2e_solo` and `home-note-not_e2e_archived` are not, and on reopening the drawer the Product row is selected and `folders-all` is not. **When** they tap `folders-all`, **then** `home-title` reads "My notes", `home-events-card` is visible, and `home-note-not_e2e_solo` is visible. | `apps/native/.maestro/phase-9/folder-filter.yaml` |
| AC8 | **Given** [folders] and home filtered to Product, **when** they long-press `home-note-not_e2e_standup` and tap `home-note-menu-remove-from-folder`, **then** the standup row is gone, `home-note-not_e2e_launch` remains, and `toast-message` reads "Removed from “Product”". **When** they tap `toast-action` ("Undo"), **then** `home-note-not_e2e_standup` is back. **When** they remove it again and let the toast expire, then open the drawer, **then** Product reads "Product, 1 note". **When** they tap `folders-all`, **then** `home-note-not_e2e_standup` is still on My notes. | `apps/native/.maestro/phase-9/folder-remove.yaml` |
| AC9 | **Given** [folders] and home filtered to Product, **when** they open the drawer and long-press `folders-row-fld_e2e_product`, **then** `folders-menu` shows `folders-menu-delete`. **When** they tap it, **then** `folder-delete-sheet` shows `folder-delete-body` "“Product” will be deleted. Its notes stay in My notes.". **When** they tap `folder-delete-close`, **then** the Product row is still there. **When** they repeat and tap `folder-delete-confirm`, **then** the sheet closes, `toast-message` reads "Folder deleted", there is no `folders-row-fld_e2e_product`, `folders-row-fld_e2e_personal` remains, and after closing the drawer `home-title` reads "My notes", with `home-note-not_e2e_launch` and `home-note-not_e2e_standup` visible. | `apps/native/.maestro/phase-9/folder-delete.yaml` |

**Flows from earlier phases that this phase changes:**

- `phase-2/home-shell-inert.yaml` stops tapping `home-folders-button`, because it now opens the
  drawer. AC1 owns it, and the header comment says so. `phase-2/home-shell.yaml` only asserts that
  the button is visible, which still holds.
- `phase-4/rename-note.yaml` is unchanged. It asserts the first two menu entries, and a third does
  not break that. It gains an `assertVisible: home-note-menu-add-to-folder` beside them.
- `phase-4/open-note.yaml` is unchanged: `note-add-to-folder` is still visible.

The whole suite for phases 2–8 must still pass.

**Screenshots for the visual check** (`TESTING.md` §8). Each is compared by eye with its discovery
shot, or with the nearest one for a designed state, before review:

| Screenshot | From flow | Compare with |
| --- | --- | --- |
| `phase-9-drawer-empty` | AC1 | #50 |
| `phase-9-drawer-populated` | AC7 | #50 (designed: the same drawer, populated) |
| `phase-9-new-folder` | AC2 | phase-4 `rename-sheet` (designed) |
| `phase-9-add-to-folder-empty` | AC3 | #17 |
| `phase-9-add-to-folder-no-results` | AC3 | #18 |
| `phase-9-add-to-folder-list` | AC5 | #17 (designed: populated) |
| `phase-9-home-folder` | AC7 | #01 (designed: folder title, no card) |
| `phase-9-home-folder-empty` | AC4 | phase-4 `home-empty` (designed) |
| `phase-9-row-menu` | AC4 | #02 |
| `phase-9-delete-folder` | AC9 | designed |

---

## 9. Designed states no flow reaches

These belong to the same scripted-failure harness seam that `BLOCKERS.md` defers for phases 3–8.

- **`folders-loading` and `add-to-folder-loading`.** The local API answers before Maestro can see
  them.
- **`folders-error`, `add-to-folder-error`, `folder-delete-error`, the generic `folder-new-error`,
  and the failure toasts for add and remove.** Each needs a request to fail on demand.
- **`FolderLimitReached`.** A flow would have to create 100 folders. It is covered by API test 3,
  and by a unit test of the sheet's error mapping `folderCreateError(error, name)`.
- **`home-folder-gone`, and the "That folder no longer exists." paths.** These need a folder
  deleted on another device mid-view. They are covered by the pure `homeListState(query, folder)`,
  which returns `loading | rows | empty | folderEmpty | folderGone | error`, and by
  `addToFolderState(...)`, both unit-tested.
- **A note trashed while its sheet is open** (`NoteTrashed` on submit). This reuses phase 4's
  `isGoneForEditing`, which is already unit-tested.

---

## 10. Blockers to record

- **Folders never sync.** #50's copy promises desktop sync, and there is no desktop. The string is
  kept verbatim, as COPY.md requires. A later wording change is a copy decision, not a code change.
- **No rename.** Discovery shows no rename entry. `PATCH /folders/{id}` can be added with the same
  `nameKey` rule, and the drawer row menu is where it would go.
- **The live recording card's Add to folder (#102) stays inert.** The note exists by then, so the
  same sheet could open over the card. But presenting a modal over the `fullScreenModal` recording
  route, while audio is capturing, needs its own device check. Deferred to phase 12's parity pass.
- **Recording from a folder view does not file the note.** A new note lands in My notes only.
  Auto-filing is a guess about intent that discovery cannot settle.
- **The folder list is capped at 100 and not paged.** A `nextCursor` can be added to `FolderList`
  without breaking clients.
- **The drawer's home "push" is a dim, not a translate.** #50's shot shows the home at its normal
  x, although the README says "pushed". Recorded for the parity pass.

---

## 11. Task split

### API (packages/domain, packages/server, packages/db, apps/api, packages/apiclient)

1. **`packages/domain`:**
   - `Domain/Ids.ts`: add `FolderId` (`fld_`).
   - `Domain/Folder.ts`: `FolderName`, `folderNameKey`, `Folder`, `FolderList`, `FolderCreate`,
     `FolderNoteAdd` and the two constants, with `Domain/Folder.test.ts` (case 10).
   - `Domain/Note.ts`: add `folderIds: z.array(FolderId)` to `Note`, and fix every fixture and
     test that builds a `Note`.
   - `Folders/Errors.ts`: `FolderNotFound`, `FolderNameTaken`, `FolderLimitReached`.
   - `Folders/Contract.ts`: the five routes (§6.1), under the tag `Folders`.
   - `Notes/Contract.ts`: add the optional `folder` to `NoteListQuery`, add the 404 to
     `listNotesRoute`, and update its description.
2. **`packages/db`:**
   - `schema/folders.ts` (`folders`, `folderNotes`), exported from `schema/index.ts`;
   - `bun run db:generate` → `d1-migrations/0008_folders.sql`;
   - `RESET_ORDER` gains `folderNotes` and then `folders` at its head.
3. **`packages/server/src/Folders/`:**
   - `FoldersRepo.ts`: `listForOwner` (with counts), `findForOwner`, `countForOwner`, `insert`
     (returns `"name-taken"` on the unique violation), `delete`, `addNote` (returns whether a row
     was inserted), `removeNote`, and `touch`;
   - `Policy.ts`;
   - `FoldersService.ts` (`list`, `create`, `delete`, `addNote`, `removeNote`), whose deps are
     `clock`, `ids`, `repo` and a type-only `notes: Pick<NotesRepo, "byId">` (then the Notes policy's owner check) for note
     ownership and trash;
   - `Http.ts`;
   - `Folders.test.ts` (1–9) and `Folders.http.test.ts`.
4. **`packages/server/src/Notes/`:**
   - `NotesRepo.listLive` gains an optional `folder` (the `exists` predicate);
   - the detail read fills `folderIds`;
   - `NotesService.list` takes a type-only `folders: Pick<FoldersRepo, "findForOwner">` dependency
     and raises `FolderNotFound`;
   - cases 11–14 in `Notes.test.ts`, and the §7 lines in `Notes.http.test.ts`.
5. **`packages/server/src/E2E/`:**
   - `E2E_FOLDERS` in `Fixtures.ts`, with `other`'s folder in the base seed and `person`'s two
     behind `seedFolders()`;
   - `E2eRepo`/`E2eService` writes;
   - `POST /e2e/folders` in `Http.ts`;
   - the `E2E.test.ts` cases.
6. **`container.ts`:** wire `FoldersRepo` and `FoldersService` under `traced()`, and give
   `NotesService` its `folders` dependency. In **`apps/api`**, mount the router, add the `Folders`
   OpenAPI tag, and extend `app.test.ts`.
7. **`packages/apiclient`:**
   - `folders.ts`, exported from `index.ts`;
   - `notes.ts`: `listNotes` accepts `{ folder }`;
   - `query-keys.ts`: `folders.*`, the `notes.list({ person?, folder? })` generalisation, the new
     invalidation keys, and `folders.all` on `trashNote` and `restoreNote`;
   - tests for the key shapes in `client.test.ts`.
8. **Docs:** add the §7 scenario names to `docs/TESTING.md` §4 and the §10 blockers to
   `docs/plan/BLOCKERS.md`.

### Native (apps/native)

1. **Design:**
   - `tokens.ts` gains `button.disabled: "#555555"`;
   - `PillButton` gains the `destructive` tone and a disabled look that uses `button.disabled` with
     `text.tertiary`, for the #17 submit;
   - `design/SearchBar.tsx` is extracted from phase 8's `SearchField` (the pill, the clear button,
     the keyboard toggle and keyboard docking), and phase 8's search is refactored onto it with no
     visual change. The phase-8 flows must stay green;
   - the dev gallery shows the new tone.
2. **`features/folders/`:**
   - `FoldersDrawer.tsx`: the overlay, the pans, the states, the rows, the create row, and the row
     menu;
   - `FolderRow.tsx`;
   - `useFolders.ts`, the `GET /folders` query and the mutations, with their invalidations;
   - `created.ts`, the one-shot hand-off;
   - `copy.ts`, holding `formatNoteCount`;
   - `viewState.ts`, holding `addToFolderState`, `folderCreateError` and `filterFolders`;
   - unit tests for the pure functions.
3. **Routes**, registered in `_layout.tsx`:
   - `app/folders/new.tsx` (the phase-2 `formSheet`, `fit`);
   - `app/folders/[id]/delete.tsx` (`formSheet`, `fit`);
   - `app/notes/[id]/folder.tsx` (`presentation: "modal"`), the Add to folder sheet with its list,
     choice circle, search bar, states and submit.
4. **Home:**
   - `HomeShell` holds the current folder, renders the drawer, wires `home-folders-button` and the
     left-edge pan, swaps the title, hides the events card in a folder view, and adds the row
     menu's Add to folder and Remove from folder entries (Remove with its optimistic update and
     Undo toast). The stale phase-9 comment goes;
   - `NoteList` takes an optional `folder`, uses `notesInfiniteQuery({ folder })`, and draws
     `home-folder-empty` and `home-folder-gone` through the pure `homeListState`, which is
     unit-tested;
   - `lib/api.ts` re-exports the folder queries and mutations.
5. **The note page:** `note-add-to-folder` pushes `/notes/[id]/folder`.
6. **Maestro:**
   - the subflows `open-folders.yaml`, `seed-folders.yaml`, `open-add-to-folder.yaml`, and
     `scripts/e2e-folders.js`;
   - the nine `phase-9/*.yaml` flows in §8;
   - `config.yaml` adds `phase-9/*`;
   - the edits to `phase-2/home-shell-inert.yaml` and `phase-4/rename-note.yaml`;
   - the §8 screenshots;
   - the layout list in `TESTING.md` §8.
