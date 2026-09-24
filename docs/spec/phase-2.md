# Phase 2: Design system and app shell

Status: spec. Source: `~/personal/granola-clone-discovery/` (`README.md` tokens, `COPY.md`,
`FEATURES.md`, `NAVIGATION.md`, `screens/01-home`, `04`, `16`, `51`, `70`). Screens are cited as
`#NN`. The product is **Notes**: wherever discovery copy names the other product, this spec says
"Notes" instead, and no logo, asset or font from it is used.

## 1. Scope

In scope:

1. **Design tokens**: colour, type, spacing, radii and elevation as one typed module in the
   native app. Dark only.
2. **Primitives**: text styles (serif display and SF Pro), pill button (light, dark, glass),
   44pt floating circular icon button, the grouped toolbar capsule, the 64pt FAB, a list icon tile,
   a card, and sheet chrome (grabber, top radius 40, a header with a title and a close button).
3. **Home shell (#01)**, static: the toolbar, the serif "My notes" title, the upcoming-events card
   in its no-calendar state, the empty list band, the "Ask anything" pill and the + FAB.
4. **Component gallery**: a screen that renders every primitive and token. It is reachable only in
   a development build (`__DEV__`).
5. **Dark-only chrome**: status bar, splash, navigation background and the welcome screen restyled
   onto the tokens, so no light-theme colour is left anywhere.

Out of scope, and owned by the phase named: note rows with real data, the list empty state and all
list gestures (4); every toolbar destination (Folders 9, Get desktop 10, Phone out of scope,
Search 8, Settings 10); the work-email sheet behind the events card (10); chat (7); recording (5);
auth copy and onboarding (3). In this phase those controls **render, carry their testID and
accessibility label, and show press feedback, but do not navigate.**

There are **no API changes** in this phase. The home shell reads no endpoint.

## 2. Design tokens

Sampled from the discovery screenshots (`README.md`, "Design tokens"). They live in
`apps/native/src/design/tokens.ts` as `as const` objects. **Components use tokens only; a hex
literal outside `tokens.ts` fails review.**

### 2.1 Colour

| Token | Hex | Used for |
| --- | --- | --- |
| `bg.app` | `#262626` | app and header background, the home header band |
| `bg.list` | `#1A1A1A` | the home list band, cards, the composer, the search field |
| `bg.sheet` | `#2A2A2A` | sheets (`#252525` for full-height sheets, `bg.sheetTall`) |
| `bg.sheetTall` | `#252525` | full-height sheets (#04, #51) |
| `bg.iconButton` | `#1E1E1E` | circular icon buttons, the toolbar capsule, dark pills |
| `bg.tile` | `#282828` | list icon tiles |
| `bg.tileRaised` | `#333333` | settings icon tiles |
| `bg.scrim` | `#000000` at 45% | behind a presented sheet |
| `border.hairline` | `#333333` | 1px borders on buttons, cards and tiles |
| `text.primary` | `#FCFDF8` | titles and body |
| `text.secondary` | `#A8AAA1` | dates, subtitles, the "Sign up" line |
| `text.tertiary` | `#8A8A8A` | captions, disabled text |
| `text.onLight` | `#1A1A1A` | text on light pills and the FAB |
| `accent.lime` | `#B0BF40` | the + FAB |
| `accent.limeSwitch` | `#B2C248` | the lime switch |
| `accent.olive` | `#677B00` | the active Send button |
| `accent.limePale` | `#E5EACC` | the idle mic button |
| `accent.oliveDark` | `#424625` | banners, search result tiles |
| `speaker.avatar` | `#E4CD75` | transcript letter avatar |
| `destructive` | `#FE4346` | swipe to trash, Delete |
| `button.light` | `#EAEBE4` | primary light pill ("Sign up with work email", "Get Started") |
| `button.lightAlt` | `#D2D2D2` | the Share pill |
| `ask.pill` | `#525252` at 85% | the home "Ask anything" glass pill |
| `hero.pink` | `#E78BCE` | the Get desktop hero |
| `tile.share` | `#ADC06F` | Get desktop share circle |
| `tile.remind` | `#8EBCEC` | Get desktop remind circle |
| `calendar.bar` | `#DB35F2` | upcoming event bar |
| `switch.on` | `#30D159` | system-green toggles |

### 2.2 Type

Two families. The serif display face is **Newsreader** (SIL OFL 1.1). It is bundled from
`apps/native/assets/fonts/` through the `expo-font` config plugin, so it is available on first
paint and never loads over the network. The licence file sits beside the font. The UI face is the
system font (SF Pro). Nothing ships Tiempos.

| Style | Family | Size / line height | Weight | Colour | Used for |
| --- | --- | --- | --- | --- | --- |
| `display` | Newsreader | 40 / 46 | Regular (400) | `text.primary` | "My notes", note titles, greetings |
| `displaySheet` | Newsreader | 34 / 40 | Regular | `text.primary` | sheet titles ("Transcript", #04 headline) |
| `title` | SF Pro | 20 / 25 | Semibold | `text.primary` | sheet nav titles ("Attendees", #16) |
| `rowTitle` | SF Pro | 17 / 22 | Semibold | `text.primary` | list row titles, card headlines |
| `body` | SF Pro | 17 / 22 | Regular | `text.primary` | body, pill labels |
| `secondary` | SF Pro | 17 / 22 | Regular | `text.secondary` | day headers, row times |
| `caption` | SF Pro | 15 / 20 | Regular | `text.secondary` | card subtitles, section headers |
| `pillLabel` | SF Pro | 17 / 22 | Medium (500) | `text.primary` | "Get desktop" |
| `askLabel` | SF Pro | 20 / 25 | Regular | `text.primary` | "Ask anything" on the home pill |

Dynamic Type is honoured up to `maxFontSizeMultiplier` 1.4 on every style, so the 44pt controls
never clip.

### 2.3 Spacing, radii, sizes

- Spacing scale: `4, 8, 12, 16, 20, 24, 32`. Screen gutter 16 for cards, rows and the toolbar; 24
  for the display title.
- Radii: `pill` = 999; `card` = 24; `sheet` = 40 (top corners only); `tile` = 10; `fab` = 32.
- Sizes: `iconButton` 44; `listTile` 44; `fab` 64; `askPill` height 64; icon glyph 22 (toolbar),
  24 (FAB and pill).
- Hairline border: 1px `border.hairline` on icon buttons, the toolbar capsule, cards and tiles.
- Icons: `lucide-react-native` (already a dependency), stroke width 1.75, colour `text.primary`
  (`text.onLight` on the FAB).

Discovery was captured on a 428pt-wide device, and the simulator is 402pt wide. Gutters and control
sizes stay absolute, and widths flex. Nothing is scaled proportionally.

## 3. Primitives (`apps/native/src/design/`)

Each one is a component, and each one appears in the gallery.

| Component | Spec | Props |
| --- | --- | --- |
| `Text` | Applies a type style from 2.2 | `variant`, `color?`, `testID?` |
| `IconButton` | 44×44 circle, `bg.iconButton`, hairline border, centred 22pt glyph. Pressed state: opacity 0.6. Hit slop 0 (it is already 44). | `icon`, `accessibilityLabel` (required), `testID`, `onPress?` |
| `ToolbarCapsule` | One pill (`bg.iconButton`, hairline) holding 2–3 `IconButton`s edge to edge; the inner buttons drop their own fill and border | `children` |
| `PillButton` | Fully rounded, height 44 (`size="md"`) or 56 (`size="lg"`, full width), optional leading icon, 16 horizontal padding. `tone`: `dark` (`bg.iconButton` + hairline, `text.primary`), `light` (`button.light`, `text.onLight`), `glass` (`ask.pill`, `text.primary`, height 64) | `tone`, `size`, `label`, `icon?`, `testID`, `accessibilityLabel?`, `onPress?`, `disabled?` |
| `Fab` | 64pt circle, `accent.lime`, black 24pt `Plus` glyph, no border | `testID`, `accessibilityLabel`, `onPress?` |
| `SendButton` | 36pt circle. `idle`: `accent.limePale` with a mic glyph, label "Hold to dictate". `active`: `accent.olive` with an arrow-up glyph, label "Send". | `state`, `testID` |
| `IconTile` | 44×44, radius 10, `bg.tile`, hairline, centred glyph | `icon`, `testID?` |
| `Card` | `bg.list`, radius 24, hairline, 16 padding. It is pressable when given `onPress`, and then it is one button with one accessibility label. | `children`, `onPress?`, `accessibilityLabel?`, `testID?` |
| `ListRow` | `IconTile` + title (`rowTitle`) + subtitle (`secondary`), 12 gap, height 52 | `icon`, `title`, `subtitle`, `testID` |
| `SheetChrome` | Grabber (36×5, radius 3, `#5A5A5A`, 8 from top), top radius 40, `bg.sheet`. Header row: optional left pill, centred `title`, right `IconButton` with an `X` glyph, label "Close". It is presented over `bg.scrim`, and swiping down dismisses it. | `title`, `onClose`, `left?`, `children`, `testID` |

`SheetChrome` is built on expo-router's `formSheet` presentation (native `UISheetPresentationController`,
grabber visible, detents `[0.5, 1]`). The sheet body inside it uses the tokens. This keeps
swipe-down dismiss native, which is what #16 and #51 do.

## 4. Screens

### 4.1 Home shell: `#01` (`apps/native/src/app/index.tsx`)

The home route renders `HomeShell` (`apps/native/src/features/home/HomeShell.tsx`). The dev
preview route in 4.3 renders the same component, so the Maestro flow proves the real screen and
not a copy of it.

**Layout, top to bottom** (from `#01` `source.xml`, in points):

1. Safe-area top inset, on `bg.app`.
2. **Toolbar**, height 44, 16 gutter, floating (no bar background):
   - Left: `IconButton` Folders (lucide `Folder`), then 6pt gap, then a `PillButton` `tone=dark`
     `size=md` with a `Laptop` glyph and the label **"Get desktop"** (about 148 wide).
   - Right: one `ToolbarCapsule` holding Phone (`Phone`), Search (`Search`) and the Settings avatar.
     The avatar is a 44pt circle showing the first letter of the signed-in user's `name`, taken
     from the better-auth session already in memory. It is `rowTitle` on `bg.tileRaised`, and it
     falls back to **"N"** when there is no session (the dev preview). No photo in this phase.
3. **Title** "My notes", `display`, 24 left inset, 20 below the toolbar.
4. **Upcoming-events card**, 16 gutter, 20 below the title, height ~81: `Card` holding an
   `IconTile` (lucide `CalendarDays`, tile fill `bg.app`) then two lines, 12 gap:
   - **"No upcoming events"** (`rowTitle`)
   - **"Sign up with your work email."** (`caption` at 17pt, `text.secondary`), with "Sign up"
     underlined.
   The whole card is one button labelled "No upcoming events, Sign up with your work email.". It
   is inert in this phase (the #04 sheet is phase 10).
5. The header band (toolbar, title and card) ends 40pt below the card on `bg.app`. The **list band**
   below it fills the rest of the screen on `bg.list`, with a flat top edge and no radius. It is a
   `ScrollView` with no rows in this phase and a bottom content inset of 64 + 16 + the safe area, so
   phase 4 rows will clear the floating bar.
6. **Floating bottom bar**, 16 gutter, 12 above the bottom safe area, 12 gap:
   - `PillButton` `tone=glass`, flex 1, height 64, a `MessageCircle` glyph (filled `text.primary`)
     and **"Ask anything"** (`askLabel`), centred. Accessibility label **"Chat with Notes"**.
   - `Fab`, accessibility label **"New note"**.

**Gestures.** No gestures in this phase. The folders left-edge swipe is phase 9. Row long-press
and row swipe are phase 4. The list band does not bounce when it is empty (`alwaysBounceVertical=false`).

**States.**

| State | What shows | Seen in discovery? |
| --- | --- | --- |
| Loading | The native splash (`bg.app`, no logo) is held by `AuthProvider` until the session resolves, then the shell paints in one frame. The shell has no spinner of its own, because it fetches nothing. | No (splash designed here) |
| Populated | Everything in the layout above, with an empty list band | Yes (#01 chrome) |
| Empty | Same as populated: the list band is empty by construction until phase 4. Phase 4 owns the designed empty state. | No |
| Error | None. The shell performs no request. The existing `GET /me` read on home is removed, and the `ProfileNotFound` branch goes with it. The session already carries the name the avatar needs. | n/a |

### 4.2 Component gallery (`apps/native/src/app/dev/gallery.tsx`)

Our own design (discovery has no such screen), in the same visual language: `bg.app` background,
a `display` title **"Gallery"**, then one section per group. Each section has a `caption` header
and a 16 gutter. It is a vertical `ScrollView`, root testID `gallery-screen`.

| Section (testID) | Header | Contents |
| --- | --- | --- |
| `gallery-colors` | Colours | One 44pt swatch per colour token, with the token name and hex in `caption` |
| `gallery-type` | Type | One line per style in 2.2, rendered as its own name ("Display", "Row title", …) |
| `gallery-buttons` | Buttons | `IconButton` (`gallery-icon-button`), `ToolbarCapsule` with three buttons, `PillButton` dark "Get desktop" (`gallery-pill-dark`), light lg **"Get Started"** (`gallery-pill-light`), glass "Ask anything" (`gallery-pill-glass`), disabled dark pill (`gallery-pill-disabled`), `Fab` (`gallery-fab`), `SendButton` idle (`gallery-send-idle`) and active (`gallery-send-active`) |
| `gallery-surfaces` | Surfaces | `IconTile`, the events `Card` (`gallery-card`), two `ListRow`s with static copy: "Preservation effort planning" / "9:39 AM" and "Solo reflection thoughts" / "2:39 PM" (`gallery-row-1`, `gallery-row-2`), under a day header "Sat 12 Sep" (`secondary`) |
| `gallery-sheets` | Sheets | A dark pill **"Open sheet"** (`gallery-open-sheet`) presenting a demo `SheetChrome` |

**Demo sheet** (`apps/native/src/app/dev/sheet.tsx`, `formSheet`): root `sheet-demo`, title
**"Attendees"**, left `PillButton` dark sm **"Add"** (`sheet-demo-add`, inert), close button
`sheet-demo-close` labelled "Close", one `ListRow`-style row with a 40pt initial avatar and
"E2E Person (me)". This mirrors #16's chrome. Close and swipe-down both return to the gallery.

**States.** It is static: populated only. There is no loading, empty or error state, because it
fetches nothing.

**Gate.** Both files are in `app/dev/`, and `app/dev/_layout.tsx` redirects to `/` when
`!__DEV__`, so a Release build renders none of it even from a deep link.

### 4.3 Dev entry points (`__DEV__` only)

Auth is phase 3, and until then there is no scripted way to sign in on the simulator. Two
development-only routes make the shell and the gallery reachable from a signed-out launch:

- `/dev/home`: renders `HomeShell` with no session, so the avatar shows "N". Its root testID is
  the same `home-screen`.
- `/dev/gallery`: section 4.2.

On the welcome screen, a development build renders a row of two small text buttons under the form,
**"Preview home"** (`welcome-dev-home`) and **"Component gallery"** (`welcome-dev-gallery`). They
are absent from a Release build (guarded by `__DEV__`, not by an env var). `isPublicNativeRoute`
treats `segments[0] === "dev"` as public **only when `__DEV__`**, and `sanitizeReturnPath` does not
allow `/dev/*`, so a returnTo can never land there.

Phase 3 replaces the phase-2 flows' entry through `welcome-dev-home` with a real sign-in subflow.
The flows here are then rewritten to go through it, and the `dev/home` route may be deleted.

### 4.4 Dark-only chrome

- `app.json`: `userInterfaceStyle: "dark"`; splash `backgroundColor` `#262626` for both
  appearances.
- `useThemedNavigation` maps `ThemeColors` onto the tokens and stops reading `useColorScheme`:
  `background` = `bg.app`, `card` = `bg.list`, `text` = `text.primary`, `muted` = `text.secondary`,
  `border` = `border.hairline`, `accent` = `accent.lime`, `onAccent` = `text.onLight`, `danger` =
  `destructive`. The navigation header stays hidden on home (`headerShown: false`). The light
  theme is deleted.
- Status bar: `light` content everywhere.
- Welcome screen: restyled onto the primitives (serif `display` "Notes", `bg.list` inputs with a
  hairline, `PillButton` light lg for submit). Its copy and every existing testID
  (`welcome-screen`, `welcome-email`, `welcome-otp`, `welcome-submit`) are unchanged, so
  `smoke/launch.yaml` keeps passing.

## 5. Copy

Verbatim from `COPY.md`, with the product name replaced:

| Where | Copy |
| --- | --- |
| Get desktop pill | Get desktop |
| Title | My notes |
| Events card, line 1 | No upcoming events |
| Events card, line 2 | Sign up with your work email. ("Sign up" underlined) |
| Ask pill | Ask anything |
| A11y: Folders button | Folders |
| A11y: Get desktop pill | Get desktop |
| A11y: Phone button | Phone |
| A11y: Search button | Search |
| A11y: Avatar | Settings |
| A11y: Ask pill | Chat with Notes (discovery: "Chat with Granola") |
| A11y: FAB | New note |
| A11y: Events card | No upcoming events, Sign up with your work email. |
| Gallery (our own) | Gallery · Colours · Type · Buttons · Surfaces · Sheets · Open sheet · Get Started |
| Demo sheet (from #16) | Attendees · Add · Close |
| Welcome dev links (our own) | Preview home · Component gallery |

## 6. testIDs

The repo convention is `<screen>-<thing>` in kebab case (AGENTS.md, docs/TESTING.md §8). The
discovery identifier each one replaces is given for traceability.

| testID | Element | Discovery id |
| --- | --- | --- |
| `home-screen` | Home root | `homeUIKitRoot` |
| `home-folders-button` | Folders icon button | `homeFoldersButton` |
| `home-get-desktop-button` | Get desktop pill | `getDesktopAppButton` |
| `home-phone-button` | Phone button | `homePhoneButton` |
| `home-search-button` | Search button | `homeSearchButton` |
| `home-settings-button` | Avatar button | `homeSettingsButton` |
| `home-avatar-initial` | Avatar's initial letter | (label "R") |
| `home-title` | "My notes" | |
| `home-events-card` | Upcoming-events card | |
| `home-list` | List band scroll view | `homeCollectionView` |
| `home-ask-button` | Ask anything pill | `homeChatInputButton` |
| `home-new-note-button` | + FAB | `plus` |
| `gallery-screen` and the section and control ids in 4.2 | Gallery | |
| `sheet-demo`, `sheet-demo-add`, `sheet-demo-close` | Demo sheet | `attendeeListSheetAddButton`, `xmark` |
| `welcome-dev-home`, `welcome-dev-gallery` | Dev entry links | |

## 7. API

None. No endpoint, schema or table is added or changed. `GET /me` stays in the API and in
`@gc/apiclient`; only the home screen stops calling it.

**API-level test cases.** None are new. The regression requirement is that the existing suites
(`Profiles.test.ts`, `Profiles.http.test.ts`, `E2E.test.ts`, `apps/api` harness tests) still pass
unchanged under `bun run test`.

## 8. Acceptance criteria

Every flow lives in `apps/native/.maestro/phase-2/`, is tagged `phase-2`, starts from
`subflows/launch-app.yaml` (`clearState` + `clearKeychain`), selects by `id` only, and waits with
`extendedWaitUntil` (never `sleep`). Phase 2 has no backend state, so there is no reset or seed
call. `config.yaml` adds `phase-2/*` to `flows`. A shared `subflows/open-dev-home.yaml` and
`subflows/open-gallery.yaml` launch the app, wait for `welcome-screen` and tap the matching dev link.

**AC1. The home shell exposes the whole toolbar.** `phase-2/home-shell.yaml`
- Given a clean launch of a development build
- When the user opens Preview home
- Then `home-screen`, `home-folders-button`, `home-get-desktop-button`, `home-phone-button`,
  `home-search-button`, `home-settings-button` and `home-title` are visible
- And `home-avatar-initial` shows "N".

**AC2. The home shell exposes the card, the Ask pill and the FAB.** `phase-2/home-shell.yaml`
- Given the home shell is showing
- Then `home-events-card`, `home-list`, `home-ask-button` and `home-new-note-button` are visible
- And the text "My notes" is visible inside `home-title` (`assertVisible` with `id` and `text`
  together, so the selector is still the id).

**AC3. The shell's controls are inert and do not crash.** `phase-2/home-shell-inert.yaml`
- Given the home shell is showing
- When the user taps each of `home-folders-button`, `home-get-desktop-button`, `home-phone-button`,
  `home-search-button`, `home-settings-button`, `home-events-card`, `home-ask-button` and
  `home-new-note-button` in turn
- Then after every tap `home-screen` is still visible and `home-title` has not moved off screen.

**AC4. The gallery renders every section.** `phase-2/gallery.yaml`
- Given a clean launch of a development build
- When the user opens Component gallery
- Then `gallery-screen` and `gallery-colors` are visible
- And scrolling (`scrollUntilVisible`) reaches `gallery-type`, `gallery-buttons`, `gallery-fab`,
  `gallery-send-idle`, `gallery-send-active`, `gallery-surfaces`, `gallery-card`, `gallery-row-1`
  and `gallery-sheets`.

**AC5. Sheet chrome presents and dismisses.** `phase-2/gallery-sheet.yaml`
- Given the gallery is showing
- When the user scrolls to and taps `gallery-open-sheet`
- Then `sheet-demo`, `sheet-demo-add` and `sheet-demo-close` are visible
- When the user taps `sheet-demo-close`
- Then `sheet-demo` is not visible and `gallery-screen` is visible
- When the user opens the sheet again and swipes down from the sheet's top
- Then `sheet-demo` is not visible.

**AC6. The signed-out launch is unchanged.** `smoke/launch.yaml` (existing, tag `smoke`)
- Given a clean launch
- Then `welcome-screen`, `welcome-email` and `welcome-submit` are visible
- And `welcome-dev-home` and `welcome-dev-gallery` are visible, because the flows run a Debug build.
  This assertion is added to the phase-2 flow `phase-2/welcome-dev-links.yaml`, not to the smoke
  flow, so smoke stays valid against a Release build.

**AC7. Dev routes are unreachable in Release.** Unit test, not a flow:
`apps/native/src/lib/auth-provider.test.ts` asserts that `isPublicNativeRoute(["dev", "home"])` is
`true` with `__DEV__` true and `false` with it false, and that `sanitizeReturnPath("/dev/gallery")`
returns `"/"`.

**AC8. Tokens are the only colour source.** Unit test `apps/native/src/design/tokens.test.ts`
asserts every hex in section 2.1. The review step greps `apps/native/src` outside `design/tokens.ts`
for `#[0-9A-Fa-f]{3,8}` and expects none.

**Exit** (from phases.md): `phase-2/home-shell.yaml` passes, `phase-2/gallery.yaml` passes, the
rest of `--include-tags=phase-2,smoke` passes on the iPhone 17 Pro simulator, and the
cache-busted `bun run check` and `bun run test` are green.

## 9. Task lists

### API (`packages/domain`, `packages/server`, `packages/db`, `apps/api`, `packages/apiclient`)

None. Phase 2 changes no contract, route, table or client.

### Native (`apps/native`)

1. Add Newsreader (Regular, Italic) TTFs and `OFL.txt` under `assets/fonts/`, and register them in
   the `expo-font` plugin entry in `app.json`.
2. Set `app.json` to `userInterfaceStyle: "dark"` and the splash background to `#262626`.
3. `src/design/tokens.ts`: colour, type, spacing, radii and size tokens (section 2), plus
   `tokens.test.ts`.
4. `src/design/`: `Text`, `IconButton`, `ToolbarCapsule`, `PillButton`, `Fab`, `SendButton`,
   `IconTile`, `Card`, `ListRow`, `SheetChrome`, and an `index.ts` barrel.
5. Point `useThemedNavigation` at the tokens, make it dark only, and give the status bar light
   content.
6. `src/features/home/HomeShell.tsx`: the section 4.1 layout with every testID. The avatar initial
   comes from `useAuth().session?.user.name`, falling back to "N".
7. Replace `src/app/index.tsx` with `HomeShell`, dropping `meQuery` and the sign-out button.
   Sign-out comes back with settings. Record this in `docs/plan/BLOCKERS.md` as a known gap
   until phase 3 or 10 restores it.
8. `src/app/dev/_layout.tsx` (redirects when `!__DEV__`), `dev/home.tsx`, `dev/gallery.tsx`, and
   `dev/sheet.tsx` (`presentation: "formSheet"`, grabber, detents `[0.5, 1]`).
9. `auth-provider.tsx`: `isPublicNativeRoute` allows `dev` only under `__DEV__`, and
   `sanitizeReturnPath` keeps refusing `/dev/*`. Add `auth-provider.test.ts` (AC7).
10. Welcome screen: restyle it onto the primitives, keep the copy and testIDs, and add the `__DEV__`
    links `welcome-dev-home` and `welcome-dev-gallery`.
11. Maestro: `subflows/open-dev-home.yaml`, `subflows/open-gallery.yaml`; `phase-2/home-shell.yaml`,
    `phase-2/home-shell-inert.yaml`, `phase-2/gallery.yaml`, `phase-2/gallery-sheet.yaml`,
    `phase-2/welcome-dev-links.yaml`; add `phase-2/*` to `.maestro/config.yaml`.
12. Run the gate: the cache-busted `bun run check`, `bun run test`, and
    `maestro test --include-tags=phase-2,smoke` on UDID `351547D8-BD3B-4418-AB30-8568D8FFB8F3`.
