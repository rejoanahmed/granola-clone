# Parity report

- **Date:** 2026-09-25
- **Graded at:** `437887f` (phase-12), then re-captured after the last fix. The fixes land in
  `fb4445e` (K1), `a5c2fc4` (K2), `917fe5a` (W8, chat titles), `437887f` (bottom-anchored controls,
  the attendees detent) and `c099b11` (toasts above the keyboard). The review's fixes land in
  `37711ec` (#18's and #87's offsets, the toast's scoped dock, #23 re-graded).
- **Simulator:** iPhone 17 Pro, iOS 26.5 (23F77), UDID `351547D8-BD3B-4418-AB30-8568D8FFB8F3`.
- **Capture:** `bun run parity` (`scripts/parity.sh`). It ran the ten `phase-12/parity-*.yaml`
  flows, and all ten passed. It left 63 of 63 shots in `artifacts/parity/2026-09-25/`.
- **Discovery:** `<discovery>/screens/NN-*/shot.png`, read side by side with
  each app shot. The discovery shots are not copied here.

**How positions were measured.** Discovery's rects come from each screen's `source.xml`, in
428×926 points. The app's come from `maestro hierarchy` on the simulator, in 402×874 points. A
control anchored to the bottom is compared by its distance from the screen's bottom edge. A
control anchored to the top is compared by its distance from the top safe area, as §4.1 says.
Horizontal positions are compared as the inset from the nearer edge. A centred layout is compared
by its offset from centre, because the extra 52pt of discovery's screen is split above and below
it.

**Maestro cannot assert position or colour.** It asserts ids, text and enabled/selected state, but
it has no bounds or colour predicate. So a geometry `must` is proven by a unit test. The test pins
the constant against the discovery rect it was measured from: `src/design/foot.test.ts`,
`src/design/offsets.test.ts`, `src/design/toastLayout.test.ts` or
`src/features/chat/navLayout.test.ts`. The fixed state also appears in the re-captured shot. This
is how AC17 reads for geometry since its 2026-09-26 amendment, and the row names the test. A
position no test can pin (the attendees detent) is deferred, not fixed.

Discovery strings that name the product are shown in their Notes form (§5).

## #01 home — parity-01-home

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P01-1 | structure | folder, Get desktop capsule, phone/search/avatar capsule; serif "My notes"; events card; day-grouped list; Ask pill + lime FAB | same controls, same order and grouping | — | match |
| P01-2 | copy | "My notes", "No upcoming events", "Sign up with your work email.", "Ask anything" | same | — | match |
| P01-3 | geometry | FAB 64pt, its bottom 46 from the screen foot | 64pt, bottom 46 | — | match |
| W2 | avatar | photo avatar | initial "E" | wont | — |
| W10 | seed | "Preservation effort planning", two rows | "Launch planning review", three rows | wont | — |

## #02 row menu — parity-02-row-menu

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P02-1 | copy | Edit title · Share notes · Add to folder | same, same glyph order | — | match |
| W6 | geometry | menu anchored at the touch point | anchored on the row's content, ~90pt right | wont | — |
| P02-2 | behaviour | the row stays in place, not dimmed, with no tile behind it | the row is redrawn over the scrim on a raised tile, scaled 1.03 | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #03 row swipe — parity-03-row-swipe

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P03-1 | structure | red trash capsule, "Move to trash" caption, row slid left | same | — | match |

## #04 work email — parity-04-work-email

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P04-1 | structure | mark, serif title, body, two-row benefits card, light pill, text button | same | — | match |
| P04-2 | copy | "It looks like you’ve connected a Gmail account…" | "Sign up with the email you use for work to see your meetings in Notes." The seed has no personal provider (phase-10 §3, designed) | wont | — |
| P04-3 | colour | "Continue anyway" grey (discovery's README: "(grey)"; the shot's text is dimmer than the pill's) | `text.secondary`, as phase-10 §3 designs it. First graded as a `text.primary` gap; re-read on review, it is the same token | — | match |
| W1 | texture | grain over `#252525` | flat `#252525` | wont | — |
| W4 | branding | the spiral logo | the app's own mark | wont | — |

## #10 note — parity-10-note

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P10-1 | structure | Back; Share pill + More; serif title; date/attendees pill + folder button; markdown body; floating Ask pill | same | — | match |
| P10-2 | geometry | Ask pill 834–898, its bottom 28 from the screen foot, inside the home-indicator inset | was 46 from the foot (phase 4 placed it 12 above the safe area), 18pt high. Now 28: `FOOT.noteAsk`, pinned by `src/design/foot.test.ts` | must | fixed (437887f) |
| W3 | type | Tiempos | Newsreader | wont | — |
| W10 | seed | "Preservation effort planning" | "Launch planning review" | wont | — |

## #11 note end — parity-11-note-end

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P11-1 | behaviour | Back, Share, More and the Ask pill pinned while the body scrolls under them | same (asserted after the scroll) | — | match |
| P11-2 | geometry | Ask pill 28 from the foot | 28 (P10-2's fix) | must | fixed (437887f) |

## #12 note menu — parity-12-note-menu

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P12-1 | copy | Edit notes · View transcript · Copy notes · separator · Move to trash (red) | same | — | match |
| P12-2 | geometry | UIKit pull-down: the card covers the More button (top at y ~51) | drawn menu 8 below the button, right edges aligned (phase-4 §2.2, which chose it) | wont | — |
| P12-3 | colour | the page behind is blurred, barely dimmed | a `bg.scrim` dim | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #13 transcript — parity-13-transcript

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P13-1 | structure | serif "Transcript", subtitle, share + close circles; speaker rows with a yellow "A" avatar | same; B gets the designed blue | — | match |
| P13-2 | type | subtitle ~15pt | 17pt, so it wraps to two lines, as discovery's does | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #14 transcript end — parity-14-transcript-end

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P14-1 | behaviour | header pinned, body scrolled to the end | same | — | match |

## #16 attendees — parity-16-attendees

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P16-1 | structure | Add pill, "Attendees", close circle, hairline rows | same | — | match |
| P16-2 | geometry | Add at y 298: 251pt under the safe area | was 272 at the 0.7 detent, 21pt low. `437887f` moved it to 0.73, which puts it at 249 (measured with `maestro hierarchy`). No test can pin a UIKit detent, so it has no AC17 proof | must | deferred (BLOCKERS: The attendees detent has no automated proof) |
| W2 | avatar | photo | initials | wont | — |

## #17 add to folder, empty — parity-17-add-to-folder

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P17-1 | structure | close, disabled "Add to folder", centred "Create folder", search field at the foot | same, submit disabled | — | match |

## #18 add to folder, no results — parity-18-add-to-folder-search

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P18-1 | copy | "No results for “pro”" | same | — | match |
| P18-2 | geometry | glyph 79pt under the nav's buttons (y 107 → 186) | was 150 under them (`maestro hierarchy`: nav bottom 122, block top 272), 71pt low; first graded `should` from the shot, a `must` by §4.2. Now 79: `OFFSETS.addToFolderNoResultsTop`, `offsets.test.ts` | must | fixed (37711ec) |

## #19 note ask — parity-19-note-ask

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P19-1 | structure | Back, centred title, history; three chips; composer with paperclip, Auto, mic | same | — | match |
| P19-2 | copy | the title "Preservation effort planning" shown whole | "Launch plannin…": both sides reserved the 96pt New chat capsule, leaving 178pt. Now a side is 44pt until the thread has messages, which leaves 278pt (discovery 245). `navLayout.test.ts` pins the room, computed from the constants ChatNav's styles use; that the seeded titles render whole is shown by the re-captured #19 and #43 shots, not by an assertion (BLOCKERS, deferred review items) | must | fixed (917fe5a) |
| P19-3 | behaviour | — (the mic dictates) | "Hold to dictate" answered with a toast drawn under the keyboard, so the tap showed nothing. With the keyboard up, toasts now sit above it and above the composer the chat docks on it (`useToastKeyboardDock`; screens that dock nothing get none). A toast without an action takes no touch. Flow `phase-12/fix-modal-toast.yaml` raises the keyboard, checks it is up, and asserts the toast `above: chat-input-bar`; run against the old placement it fails. The offset is pinned by `toastLayout.test.ts` | must | fixed (37711ec) |

## #20 note ask, typed — parity-20-note-ask-typed

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P20-1 | behaviour | the mic becomes an olive send arrow | same, a11y "Send" | — | match |

## #21 note ask, cleared — parity-21-note-ask-cleared

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P21-1 | behaviour | back to the pale mic, "Hold to dictate" | same | — | match |

## #22 model menu — parity-22-model-menu

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P22-1 | structure | dark card above the pill, check column, one greyed model, "Auto (default)" last and checked | same | — | match |
| P22-2 | behaviour | tapping outside closes the menu with no change | the capture's dismiss tapped the scrim at 50%,12%, where this tall card's first row sits, so it picked "Swift Thinking" and #23's shot showed that pill. The flow now taps beside the card and asserts the pill still reads Auto. A test fault, not an app one | — | match |
| W5 | copy | vendor model names and logos | the fake list's neutral names and glyphs | wont | — |

## #23 attachment menu — parity-23-attach

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| W8 | structure | paperclip opens "Choose from Photo Library" / "Take Photo" | was a toast drawn under the keyboard, so the paperclip looked live and did nothing. Now it opens #23's menu inline above the composer, keyboard still up, both items disabled, with the caption "Coming soon" (designed). Asserted in `parity-chat-note.yaml`. Re-graded on review from a new capture: the earlier #23 shot's pill read "Swift Thinking" (P22-2); it reads Auto now | must | fixed (917fe5a) |
| P23-1 | colour | items in `text.primary` | disabled at 40%, which is the point | wont | — |
| P23-2 | geometry | the card overlaps the composer, covering the paperclip | the card ends 8 above the paperclip, ActionMenu's anchoring rule (phase-4 §2.2, as P12-2) | wont | — |

## #24 history — parity-24-history

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P24-1 | structure | half sheet: close, "Chat History", "Older" section, title + preview · date rows, search at the foot | same | — | match |
| P24-2 | copy | the chat title behind the sheet shown whole | truncated before P19-2's fix; whole now | must | fixed (917fe5a) |
| W10 | seed | one thread | two | wont | — |

## #25 thread — parity-25-thread

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P25-1 | structure | user bubble, "Loaded notes ›", answer with bold span and cite chip 1, action row; New chat + history capsule | same | — | match |
| P25-2 | behaviour | a thread opened from history shows the keyboard down | the keyboard from the composer stays up | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |
| P25-3 | structure | Copy as image in the action row | absent (out of scope in the phase plan, retired in D036) | wont | — |

## #26 activity — parity-26-activity

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P26-1 | structure | close, "Activity", three steps joined by a rail, the last one "Done" | same | — | match |
| P26-2 | type | step labels ~15pt; glyphs bare | 17pt; glyphs in hairline tiles | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #27 activity expanded — parity-27-activity-expanded

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P27-1 | structure | step 0 expanded with a chevron-down and an olive-tiled note row | same | — | match |

## #28 citation — parity-28-citation

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P28-1 | structure | close, serif title, date pill with avatar, body | same | — | match |
| W2 | avatar | photo in the pill | initial | wont | — |

## #29 message long-press — parity-29-select

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| W9 | behaviour | UIKit edit menu (Copy · Look Up · Translate ›) with the word selected | UIKit's callout with Copy: the text is selectable. The flow now waits for "Copy" after the long-press, which UIKit only offers on selectable text | wont | — |

## #30 new thread — parity-30-new-thread

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P30-1 | copy | "Hi E2E, ask anything" in serif (discovery's name is its own) and four chips, no New chat | same | — | match |
| P30-2 | structure | keeps the old thread's title and raises the keyboard | no title, keyboard down (phase 7: a new chat is untitled) | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #31 editor — parity-31-editor

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P31-1 | structure | close circle, light check circle, raw markdown, keyboard toggle over the keyboard | same | — | match |

## #40 solo note — parity-40-solo-note

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P40-1 | copy | "Not much to transcribe here…" then italic "Notes works best with real conversations…" | same, with a paragraph gap discovery does not have | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |
| P40-2 | geometry | Ask pill 28 from the foot | 28 (P10-2's fix) | must | fixed (437887f) |

## #41 solo menu — parity-41-solo-menu

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P41-1 | copy | the same four items as #12 | same | — | match |
| P41-2 | geometry | pull-down covers the More button | 8 below it (as P12-2) | wont | — |

## #42 solo transcript — parity-42-solo-transcript

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P42-1 | copy | Speaker A, "Hello. How are you?" | same | — | match |

## #43 solo ask — parity-43-solo-ask

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P43-1 | copy | "Solo reflection thoughts" shown whole | "Solo reflection t…". Whole since P19-2's fix: the room is pinned by `navLayout.test.ts`, the whole title is visible in the re-captured shot (see P19-2 for what that does not prove). The flow now also asserts `chat-chip-2` (§3.5) | must | fixed (917fe5a) |

## #44 solo chips scrolled — parity-44-solo-chips-scrolled

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P44-1 | behaviour | the chip row scrolls to "List Q&A" | same, in the shot. The flow's `chat-chip-2` assertion holds before the swipe too, so the scroll is captured, not asserted (BLOCKERS, deferred review items) | — | match |

## #50 folders drawer — parity-50-folders-drawer

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P50-1 | copy | "No folders yet", "Folders will appear here after they are synced.", "Create new folder" | same | — | match |
| P50-2 | geometry | 44pt Create row at y 870–914, its bottom 12 from the screen foot | a 32pt row whose bottom was 50 from the foot, 38pt high. Now it is 44pt, 12 from the foot: `FOOT.drawerCreate`, `foot.test.ts` | must | fixed (437887f) |
| P50-3 | type | empty-state body ~15pt | 17pt | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |
| K3 | behaviour | home stays at its normal x behind a `#121212` dim (the README's "pushed" is wrong) | the same dim, no translate | — | match |

## #51 get desktop — parity-51-desktop

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P51-1 | copy | "Meeting notes on your computer", "Take notes on video calls with Notes for Mac or Windows.", Share link, Remind me later, Done | same | — | match |
| P51-2 | geometry | Done at y 846–894, its bottom 32 from the foot | 50 from the foot, 18pt high. Now 32: `FOOT.sheetDone`, `foot.test.ts` | must | fixed (437887f) |
| P51-3 | geometry | Done is 48pt tall | 56pt (`size="lg"`) | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |
| P51-4 | geometry | the title 113pt under the hero | 87pt under it. The block is centred between the hero and Done, and discovery's screen is 52pt taller, so half of that is the device | wont | — |

## #60 search empty — parity-60-search-empty

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P60-1 | copy | serif "Search your notes" / "Search by title, notes, or people." | same | — | match |

## #61 search results — parity-61-search-results

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P61-1 | structure | "People" row (avatar, name, email), "Previous meetings" rows with olive tiles, clear button | same | — | match |
| W2 | avatar | photo | initial | wont | — |

## #62 search cleared — parity-62-search-cleared

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P62-1 | behaviour | empty state back, field at the foot | same, toggle labelled "Show keyboard" | — | match |
| P62-2 | glyph | a plain keyboard glyph when the keyboard is down | the keyboard-with-chevron-down glyph in both states | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #63 no results — parity-63-no-results

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P63-1 | copy | serif "No results" / "for “zzqx”" | same | — | match |

## #64 body match — parity-64-body-match

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P64-1 | structure | only "Previous meetings" | same | — | match |

## #65 person — parity-65-person

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P65-1 | structure | avatar, serif name, email and domain rows, hairline, day-grouped meetings, Ask pill | same | — | match |
| P65-2 | geometry | Ask pill 820–884, its bottom 42 from the foot | 50, 8pt high. Aligned anyway to 42: `FOOT.personAsk` | should | fixed (437887f) |
| W2 | avatar | photo | initial | wont | — |

## #66 person ask — parity-66-person-ask

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P66-1 | copy | the person's name as the title, three chips | same | — | match |

## #70 global ask — parity-70-global-ask

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P70-1 | structure | grabber, close, history, serif greeting, four chips, composer | same | — | match |
| P70-2 | copy | first placeholder "Summarize my meetings this week" | "Ask anything", then the rotation | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |
| P70-3 | geometry | greeting 144pt under the safe area | 167 under it, but 151 under the sheet's close button (discovery 144): the sheet's own inset, W7 | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |
| W7 | colour | home barely peeks above the sheet | UIKit page-sheet dimming | wont | — |

## #71 global chips scrolled — parity-71-global-chips-scrolled

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P71-1 | copy | "What are the top customer issues?" revealed | same | — | match |
| P71-2 | behaviour | keyboard down after the swipe | keyboard stays up | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #72 global history — parity-72-global-history

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P72-1 | structure | the same half sheet as #24 | same | — | match |

## #73 history swipe — parity-73-history-swipe

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P73-1 | structure | red Delete and grey Pin capsules with captions | same | — | match |

## #74 history menu — parity-74-history-menu

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P74-1 | copy | Pin · Delete (red) | same | — | match |
| P74-2 | geometry | menu above the lifted row | below the row, the row not lifted | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #80 settings — parity-80-settings

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P80-1 | copy | "Get Notes for Mac or Windows"; Account, Features, Support sections; Subscription "Coming soon" | same | — | match |
| P80-2 | type | nav title "Settings" ~17pt | 20pt semibold (README's nav-title scale) | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #81 settings bottom — parity-81-settings-bottom

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P81-1 | copy | "Share Notes for iPhone", "…improve the experience for Notes users", Learn more, Privacy policy, Sign out | same | — | match |
| P81-2 | type | "Use my data to improve models for everyone" on one line | wraps at 17pt | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |
| W11 | copy | 1.15.7 (5844) | 1.0.0 (1) | wont | — |

## #82 profile — parity-82-profile

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P82-1 | copy | serif "Your profile", "Notes works best when it knows a little about you…", Name / Job Title / Company Name / User Type | same | — | match |
| W2 | avatar | photo | serif initial | wont | — |

## #83 profile bottom — parity-83-profile-bottom

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P83-1 | structure | Company Description card, LinkedIn card, red Delete Account row, note under it | same | — | match |
| P83-2 | type | the delete note ~13pt | 15pt | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #84 user type — parity-84-user-type

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P84-1 | copy | Investing · Recruiting · Customer Facing · Startup/Generalist (checked) · Other | same | — | match |

## #85 notifications — parity-85-notifications

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P85-1 | copy | "Upcoming meetings", the lock-screen line, preview with a magenta bar and "Start Notes" | same | — | match |
| W4 | branding | the spiral on the Start button | the app's mark | wont | — |

## #86 chat settings — parity-86-chat-settings

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P86-1 | copy | Dictation / "Auto-send chat dictation" / "Send dictated messages when transcription finishes" | same | — | match |

## #87 phone calls — parity-87-phone-calls

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P87-1 | copy | "Phone Call Settings", "Make Calls From Notes", two benefit rows, "Get Started →" | same | — | match |
| P87-2 | geometry | the centred block (ring top 314 to Get Started's bottom 683) sits 35.5pt below the screen's centre | was 19.5 below it (ring 263 to button 650), 16pt off: a `must` by §4.2, first graded `should`. Now 35.5: `OFFSETS.phoneCallsCentreShift`, `offsets.test.ts`, re-measured with `maestro hierarchy` | must | fixed (37711ec) |

## #88 watch — parity-88-watch

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P88-1 | copy | "Apple Watch", "No Apple Watch found", "Pair a watch to continue.", "…to use Notes from your wrist." | same | — | match |
| P88-2 | colour | the info card's text is `#DCDED3` (sampled), which is no README token | `text.secondary` `#A8AAA1` | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |
| P88-3 | asset | a watch photo | a drawn watch with the lime "0:07:26" face | wont | — |

## #89 get desktop from settings — parity-89-desktop-from-settings

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P89-1 | structure | the #51 sheet | same | — | match |
| P89-2 | geometry | Done 32 from the foot | 32 (P51-2's fix) | must | fixed (437887f) |

## #90 report a bug — parity-90-report-bug

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P90-1 | copy | Close · "Report a bug" · Send; "Describe the bug" prompt and template; Diagnostics row with "…the Notes team…" | same, with the curly apostrophe (phase 10) | — | match |
| P90-2 | behaviour | Send disabled with an empty message | same (asserted) | — | match |
| K2 | behaviour | Diagnostics reachable with the keyboard up | the keyboard covered it. `SupportForm` is now a KeyboardAwareScrollView, with a 16pt clearance. Flow `phase-12/report-bug-keyboard.yaml`; `phase-10/report-bug.yaml` types and then toggles again | must | fixed (a5c2fc4) |
| P90-3 | geometry | template lines 45pt apart | 52pt, so the card is taller | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #100 mic primer — parity-100-mic-primer

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P100-1 | copy | waveform, serif "Enable your microphone to start transcribing", Continue, close | same | — | match |
| W4 | branding | §4.4 lists the spiral here, but #100 shows none: its glyph is SF's plain `waveform` | a plain waveform glyph, no logo | wont | — |

## #101 mic alert — parity-101-mic-alert

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| W9 | copy | purpose string "Notes needs microphone access to transcribe your meeting" | same (asserted) | wont | — |
| P101-1 | structure | the primer card stays visible, dimmed, under the alert | the primer closes before the alert shows | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #102 live card — parity-102-live-card

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P102-1 | structure | minimise, paperclip + More capsule, serif "Untitled note", date pill + folder button, notes field, lime bar | same | — | match |
| K1 | behaviour | Add to folder opens the folder sheet | inert (`onPress={() => undefined}`). It now pushes `/notes/[id]/folder` over the card; the timer keeps counting and submit lands back on the card. Flow `phase-12/recording-add-to-folder.yaml` | must | fixed (fb4445e) |
| P102-2 | geometry | lime bar at y 830–894, its bottom 32 from the foot | 58 from the foot, 26pt high. Now 32: `FOOT.recordingBar`, `foot.test.ts` | must | fixed (437887f) |
| P102-3 | type | timer ~21pt | ~27pt | should | deferred (BLOCKERS: Parity should-grade gaps left for a polish pass) |

## #103 live typing — parity-103-live-typing

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P103-1 | structure | lime mini pill (waveform + timer) and a keyboard-dismiss circle docked above the keyboard | same | — | match |

## #104 live menu — parity-104-live-menu

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P104-1 | copy | only "Discard note" (red) | same | — | match |
| P104-2 | geometry | pull-down over the capsule | 8 below it (as P12-2) | wont | — |
| P104-3 | geometry | bar 32 from the foot | 32 (P102-2's fix) | must | fixed (437887f) |

## #105 uploading — parity-105-uploading

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P105-1 | copy | status row "Uploading transcript..." with a spinner | same | — | match |

## #106 generating — parity-106-generating

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P106-1 | copy | "Generating notes..." | same | — | match |

## #107 finished — parity-107-finished

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| P107-1 | copy | a generated title and "Not much to summarize here…" in italics, ending "…it’ll be there." | the fake LLM's canned short body (phase 6), which ends "…a personal brain dump." and asserts "Notes works best with real conversations" | wont | — |
| W4 | branding | — | no logo in the body | wont | — |

## Designed states

§4.3's sweep covers the states discovery never saw. The earlier phases' flows take these shots, and
they were opened from the final full-suite run (`bash scripts/maestro.sh`). Each one was checked
against the token table and the type scale alone.

Eighteen shots were read, each the newest copy the suite has taken: `phase-3-onboarding-{name,about,menu,ready}`,
`phase-4-empty`, `phase-4-note-not-found`, `phase-7-streaming`, `phase-9-drawer-populated`,
`phase-9-add-to-folder-list`, `phase-9-new-folder`, `phase-9-delete-folder`, `phase-9-home-folder`,
`phase-9-home-folder-empty`, `phase-10-feedback`, `phase-10-delete-sheet`, `phase-11-events-card`,
`phase-11-events-error` and `phase-11-event-gone`.

| Id | Aspect | Discovery | App | Grade | Status |
| --- | --- | --- | --- | --- | --- |
| D1 | type | serif display for page titles and empty-state headlines | serif on every designed headline: "What should we call you?", "No notes yet", "No notes in this folder", "This note isn’t available", "You’re all set, Rita", folder titles | — | match |
| D2 | colour | `bg.app` / `bg.list` bands, `bg.sheet` sheets, lime FAB, magenta calendar bar, `destructive` delete pills | the same tokens; the events card's "Now" badge is `accent.olive.dark` with lime text | — | match |
| D3 | type | row titles 17 semibold, secondary lines in `text.secondary` | same across the drawer, the folder list, the events card and the sheets | — | match |
| D4 | behaviour | — | onboarding's "about" step, with the keyboard up, scrolls its serif title under the header, so only its last word shows. Clipped text on a core journey is a `must` by §4.2 (first graded `should`) | must | deferred (BLOCKERS: Onboarding's about step clips its title with the keyboard up) |

## Summary

| Grade | match | fixed | deferred | — (wont) | Rows |
| --- | --- | --- | --- | --- | --- |
| must | 0 | 17 | 2 | 0 | 19 |
| should | 0 | 1 | 21 | 0 | 22 |
| wont | 0 | 0 | 0 | 31 | 31 |
| — (no gap) | 66 | 0 | 0 | 0 | 66 |

The 19 `must` rows come from thirteen distinct gaps. Where one fix shows on several screens, it has
a row under each of them:

1. **K1**: the live card's Add to folder was inert (#102). `recording-add-to-folder.yaml`.
2. **K2**: Diagnostics was unreachable with the keyboard up (#90). `report-bug-keyboard.yaml`.
3. **W8**: the paperclip looked live and did nothing visible (#23). The menu has disabled items and
   "Coming soon", asserted in `parity-chat-note.yaml`.
4. **P19-3**: toasts drew under the keyboard. `fix-modal-toast.yaml` (relational) and
   `toastLayout.test.ts`.
5. **P19-2**: scoped chat titles were truncated (#19, #24, #43). `navLayout.test.ts`.
6. **P10-2**: the note page's Ask pill sat 18pt high (#10, #11, #40). `foot.test.ts`.
7. **P102-2**: the live card's bar sat 26pt high (#102, #104). `foot.test.ts`.
8. **P50-2**: the drawer's Create row sat 38pt high (#50). `foot.test.ts`.
9. **P51-2**: the Get desktop sheet's Done sat 18pt high (#51, #89). `foot.test.ts`.
10. **P18-2**: Add to folder's no-results block sat 71pt low (#18). `offsets.test.ts`.
11. **P87-2**: Phone calls' centred block sat 16pt high (#87). `offsets.test.ts`.
12. **P16-2**: the attendees sheet's header sat 21pt low (#16). Fixed in `437887f`, but with no
    proof AC17 accepts, so deferred: "The attendees detent has no automated proof".
13. **D4**: onboarding's about step clips its title with the keyboard up. Deferred: "Onboarding's
    about step clips its title with the keyboard up".

No `must` is open. K1, K2 and K3 are closed in BLOCKERS.md. The 21 deferred `should` rows share
one entry there, "Parity should-grade gaps left for a polish pass".
