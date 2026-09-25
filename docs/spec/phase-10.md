# Phase 10 — Settings, profile and upsells

Phase 3 left **Settings** as a stub: a Back button, a **Sign out** card and the version footer. This
phase builds the whole of #80–#81 around it:

- the **Account** section: Profile, Notifications, and Subscription (coming soon);
- the **Features** section: Chat, Phone calls, Watch;
- the **Support** section: Send feedback, Report a bug, Help center, Share Notes for iPhone,
  Recover Corrupted Notes;
- **Data & sharing**, **Sign out** and the version.

It also builds every page those rows open, and the two upsell sheets that home has drawn but left
inert since phase 2:

- **Get desktop** (#51, #89), opened from home's `home-get-desktop-button` and from the settings
  banner;
- the **work-email upsell** (#04), opened from home's `home-events-card`.

**Nothing leaves the fakes.** Report a bug, Send feedback and the desktop reminder all go through
phase 3's `Email` port. Its only implementation is `EmailFake`, which writes to `email_outbox`, and
the harness reads that table back. The toggles are stored server-side. None of them changes
behaviour yet, because what they would control is faked or out of scope (§10).

**Discovery saw the settings read-only.** Nothing was typed, toggled, sent or deleted
(NOT-EXERCISED.md). So none of these was seen:

- a saved profile field, a failed save, or an invalid LinkedIn username;
- a switch turned off;
- a filled bug report and its sent state;
- the delete-account confirmation;
- the "Remind me later" outcome;
- where "Sign up with work email" and "Continue anyway" lead.

This spec designs each of them in the language of the nearest captured screen, and marks each one
*(designed)*.

**References and ids.** `#NN` is `~/personal/granola-clone-discovery/screens/NN-*/`. Tokens come
from the discovery README and `apps/native/src/design/tokens.ts`. Layout numbers are iOS points
measured on the 428pt discovery device. The clone runs at 402pt, so horizontal measurements are
insets from an edge. Discovery's own ids (`settingsProfileButton`, `bugReportSubmitButton`, …) are
mapped to the clone's `<screen>-<thing>` ids in §5.

**Branding.** Every string that names the product says **Notes** (§4). The Granola spiral (#04, #85)
is replaced by the Notes mark. The Notes mark is the lucide `NotebookPen` glyph at stroke 1.75 in
`text.primary`, the same glyph the drawer's My notes tile uses, and it is never a spiral.

---

## 1. Scope

| In | Out (and where it goes) |
| --- | --- |
| The settings list (#80, #81): the banner, four sections, Sign out, the version footer | Real subscriptions and payments (phases.md, Out of scope). The Subscription row is disabled with its **Coming soon** badge, as #80 draws it (§3.1) |
| Profile (#82, #83, #84): name, job title, company name, user type, company description and LinkedIn username, each saved on edit; an initial avatar; Delete Account | Avatar photo upload. Discovery shows a photo, but the clone has no image storage, so the avatar is always an initial (§10) |
| Delete account: a preview of how many notes would be lost, a confirmation sheet *(designed)*, then deletion and a return to welcome | Changing the account's email address (phase 3's `ProfilePatch` refuses it) |
| Notifications (#85): the **Upcoming meetings** toggle, stored, and the static lock-screen preview card | Sending any notification. Upcoming meetings arrive with phase 11's fake calendar, and push is out of scope (§10) |
| Chat (#86): the **Auto-send chat dictation** toggle, stored | Dictation itself (phase 7, Out of scope). The toggle has nothing to control yet (§10) |
| Data & sharing (#81): the **Use my data** toggle, stored; Learn more and Privacy policy open in the in-app browser | Any model training. The LLM is a fake |
| Report a bug (#90) and Send feedback, both an in-app form *(designed for feedback)*, sent through the fake `Email` port | The `mailto:` hand-off discovery saw for Send feedback. The simulator has no Mail app, and the rule is that email is a fake (§3.9) |
| Help center (in-app browser), Share Notes for iPhone (the iOS share sheet), Recover Corrupted Notes (a toast, *designed*) | Real help content. The URLs are placeholders under `notes.example` (§10) |
| Phone calls (#87) and Watch (#88) as static pages; **Get Started** answers with a coming-soon toast | Phone-call recording and Apple Watch (phases.md, Out of scope) |
| Get desktop (#51, #89): the sheet from home and from settings. **Share link** opens the iOS share sheet; **Remind me later** emails the caller a link through the fake `Email` port *(designed)* | A desktop app |
| The work-email upsell (#04) from home's events card. **Sign up with work email** signs out to welcome *(designed)*; **Continue anyway** closes it *(designed)* | Calendar connection (phase 11 fakes one; real OAuth is later) |
| API: `GET`/`PATCH /me/settings`, `GET /me/deletion-preview`, `DELETE /me`, `POST /support/bug-reports`, `POST /support/feedback`, `POST /me/desktop-reminder`, and the harness route `GET /e2e/support` | A bug report's diagnostics bundle. There are no client logs to ship, so the flag is carried as a fact in the message (§6.3) |

---

## 2. Journey

```
Home ── avatar (home-settings-button) ──▶ Settings (push)                                   #80/#81
  │                                        │ banner ──▶ Get desktop sheet (modal)             #89 = #51
  │                                        │ Profile ──▶ Profile (push)                        #82/#83
  │                                        │              │ User Type ──▶ menu                  #84
  │                                        │              └ Delete Account ──▶ confirm sheet ──▶ welcome
  │                                        │ Notifications ──▶ (push)                          #85
  │                                        │ Subscription   (disabled, "Coming soon")
  │                                        │ Chat ──▶ (push)                                   #86
  │                                        │ Phone calls ──▶ (push)                            #87
  │                                        │ Watch ──▶ (push)                                  #88
  │                                        │ Send feedback ──▶ feedback form (modal)           (designed)
  │                                        │ Report a bug ──▶ bug form (modal)                 #90
  │                                        │ Help center ──▶ in-app browser
  │                                        │ Share Notes for iPhone ──▶ iOS share sheet
  │                                        │ Recover Corrupted Notes ──▶ toast                 (designed)
  │                                        │ Use my data toggle · Learn more · Privacy policy
  │                                        └ Sign out ──▶ welcome
  ├── Get desktop (home-get-desktop-button) ──▶ Get desktop sheet (modal)                  #51
  │                                             │ Share link ──▶ iOS share sheet
  │                                             │ Remind me later ──▶ toast, sheet closes    (designed)
  │                                             └ Done / swipe down ──▶ back
  └── events card (home-events-card) ──▶ Work-email sheet (modal)                          #04
                                          │ Sign up with work email ──▶ sign out ──▶ welcome   (designed)
                                          └ Continue anyway / swipe down ──▶ home               (designed)
```

**Presentation** (NAVIGATION.md):

- Settings and its sub-pages are **pushes**, each with the circular Back button.
- Report a bug, Send feedback, Get desktop and the work-email sheet are **modals**.
- The delete confirmation is a phase-2 `formSheet`.

---

## 3. Screens and states

The shared settings chrome comes from #80 and is used by every pushed settings page:

- **Header.** The phase-2 44pt `IconButton` Back (`ChevronLeft`) sits at leading 20. The title is
  centred in `title` 20/25 semibold. The header is 44pt tall, below the top safe area, with the
  fill `bg.app` `#262626`. Profile (#82) and Watch (#88) have **no header title**: they put a
  serif display title in the content instead.
- **Section header.** 15/20 regular, `text.secondary`. It sits 28pt from the left screen edge (the
  card's inset of 20 plus 8), 32pt below the previous card, and 12pt above its own card.
- **Card** (the component is `SettingsCard`). The fill is `bg.app`, with a 1pt `border.hairline`
  `#333` border and radius 28. It is inset 20pt from both edges and has 8pt of vertical padding.
  Rows have **no dividers**: #80 separates them by spacing alone.
- **Row** (`SettingsRow`). The row is 52pt tall with padding 16 on both sides:
  - a 32pt icon tile: radius 10, fill `bg.tileRaised` `#333333`, with an 18pt lucide glyph in
    `text.primary`, stroke `ICON_STROKE`;
  - a 16pt gap, then the label in `body` 17/22 `text.primary`, flexible;
  - a trailing accessory, which is one of: `ChevronRight` (16pt, `text.secondary`), `ArrowUpRight`
    (external), a badge, a switch, or nothing.
  - The whole row is a button with `PRESSED_OPACITY`. Its a11y label is its label, and its a11y
    role is `button` or `link` (for external rows).
- **Toggle** (`design/Toggle.tsx`, new). It is drawn, not RN `Switch`: 51×31 with a 27pt white
  thumb.
  - The track is `switch.on` `#30D159` when on, and `lime.switch` `#B2C248` on the bug form (#90).
  - The track is `#39393D` when off. This is a new token, `switch.off`. The off state was never
    seen, so it is the iOS system off track.
  - The thumb moves in a 200 ms timing animation.
  - The role is `switch`, and `accessibilityState` carries `{ checked, selected: checked }`.
    `selected` is what the flows assert, because it is the state Maestro already reads in this repo
    (phase 7's `answer-actions.yaml`).
  - The testID is on the toggle itself. Tapping anywhere on the row flips it.
- Everything scrolls in one `ScrollView` (`<page>-scroll`) under the header. The bottom padding is
  the safe-area inset plus 32.

**Saving a toggle** is the same on every page:

- The change is optimistic: it flips at once and sends `PATCH /me/settings { <key>: value }`.
- On failure it flips back, and the toast reads **"Couldn’t save this setting. Try again."**
- A toggle is disabled while its own request is in flight, so fast double taps cannot race.
- The settings come from `GET /me/settings` (query key `settings.me`).
  - **Loading:** each toggle is replaced by a small `ActivityIndicator` (`<toggle id>-loading`) in
    `text.secondary`.
  - **Error:** the toggle's place holds a text button **"Retry"** (`<toggle id>-retry`,
    `secondary`, `text.secondary`) that refetches. *(designed)*

### 3.1 Settings (`settings-screen`) — `app/settings/index.tsx` (#80, #81)

From the top, below the header:

1. **Desktop banner** `settings-desktop-banner` (#80). It is a full-width pill, inset 20, 56pt tall
   and fully rounded, with the fill `olive.dark` `#424625`.
   - Contents: a leading 20 `Laptop` glyph (20pt, `text.primary`), a 16pt gap, then
     **"Get Notes for Mac or Windows"** in `body` 17/22, and a trailing 20 `ChevronRight`.
   - It is 24pt below the header, and a11y role `button`.
   - It presents `/desktop` (§3.10).
2. **Account** (`settings-section-account`):
   - **Profile** `settings-profile`, `User` glyph, chevron → `/settings/profile`.
   - **Notifications** `settings-notifications`, `Bell` glyph, chevron → `/settings/notifications`.
   - **Subscription** `settings-subscription`, `CreditCard` glyph.
     - The label is in `text.tertiary`, and the tile glyph is in `text.tertiary` too.
     - The trailing badge `settings-subscription-badge` reads **"Coming soon"**: a pill 30pt tall
       with padding 12, fill `bg.tileRaised`, and `secondary` 15/20 in `text.secondary`.
     - There is no chevron. The row is **not a button**: `accessibilityState.disabled`, and a tap
       does nothing, as #80 draws it.
3. **Features** (`settings-section-features`):
   - **Chat** `settings-chat`, `MessageCircle` glyph, chevron → `/settings/chat`.
   - **Phone calls** `settings-phone-calls`, `Phone` glyph, chevron → `/settings/phone-calls`.
   - **Watch** `settings-watch`, `Watch` glyph, chevron → `/settings/watch`.
4. **Support** (`settings-section-support`):
   - **Send feedback** `settings-feedback`, `Mail` glyph, chevron → `/settings/feedback` (§3.9).
   - **Report a bug** `settings-report-bug`, `TriangleAlert` glyph, chevron → `/settings/report-bug`.
   - **Help center** `settings-help`, `BookText` glyph, trailing `ArrowUpRight`, role `link`.
     `WebBrowser.openBrowserAsync(LINKS.help)`.
   - **Share Notes for iPhone** `settings-share-app`, `Gift` glyph, chevron.
     `Share.share({ message: SHARE_APP_MESSAGE })` (§4).
   - **Recover Corrupted Notes** `settings-recover`, `RotateCcw` glyph, **no accessory** (#80).
     *(designed)* A tap shows a spinner in the accessory slot for 600 ms (a fixed delay, so the tap
     reads as "checked"), then the toast **"No corrupted notes found."** Notes are server-backed,
     so there is never a local copy to recover. It makes no request.
5. **Data & sharing** (`settings-section-data`, #81). It is one card with 20pt padding and no icon
   row at the top:
   - **"Use my data to improve models for everyone"** in `body` 17/22 `text.primary`;
   - 16pt below, **"Your data is anonymized and used to improve the experience for Notes users"**
     in `secondary` 17/22 `text.secondary`;
   - directly under it, **"Learn more"** (`settings-data-learn-more`) in `secondary` in the new
     token `text.link` `#0A84FF` (sampled from #81), role `link`, opening `LINKS.learnMore`;
   - 24pt below, a row: a 32pt tile (`FileText` glyph), a 16pt gap, then a two-line column with
     **"Use my data"** (`body`) and **"Privacy policy"** (`settings-data-privacy`, `secondary`,
     `text.link`, role `link`, opening `LINKS.privacy`), and the trailing toggle
     `settings-use-my-data` (default on).
6. **Sign out** `settings-sign-out`. This is the existing phase-3 card, moved here unchanged: a
   separate card 64pt tall, 24pt below Data & sharing, `LogOut` glyph, **"Sign out"**, and the busy
   spinner. Its behaviour (`useSignOut`) is untouched.
7. **Version** `settings-version`, unchanged: **"1.0.0 (1)"**, 16pt below, `caption` in
   `text.tertiary`, centred.

**States.** The list itself has no loading or error state. Only `settings-use-my-data` depends on a
fetch, and it follows the toggle rules above.

### 3.2 Profile (`profile-screen`) — `app/settings/profile.tsx` (#82, #83)

The header holds Back only (`profile-back`), with no title. The content (`profile-scroll`) is inset
20:

- **"Your profile"** `profile-title`, serif `display` 40/46, left-aligned, 24pt below the header.
- 12pt below, `profile-lead` in `body` 17/22 `text.primary`: **"Notes works best when it knows a
  little about you. Make sure this is correct to get the most out of Notes."**
- 32pt below, the **avatar** `profile-avatar`: a 124pt circle, centred, measured off #82.
  - *(designed)* The clone has no photos. The fill is `bg.tileRaised`, and the content is the
    first letter of the name, upper-cased: serif `display` at 56pt, `text.primary`, centred.
  - It uses the same `initial()` helper as home's avatar (`features/home/initial.ts`). With no
    name it falls back to the email's first letter.
  - It is not pressable.
- 12pt below, `profile-email`: the email in `body` 17/22, `text.secondary`, centred.
- 32pt below, the **details card** `profile-details`. This is `SettingsCard` with no vertical
  padding, holding four `FormRow`s (the phase-3 component). Each row is 56pt, with the label on the
  left at 17/22 `text.primary` and the right-aligned value field at 17/22 `text.primary`. A
  placeholder is in `text.tertiary`. Dividers are `FormDivider`, inset 20 from the leading edge and
  running to the trailing edge, as #82 draws them.
  - **Name** — `profile-name`, placeholder **"Your name"**, `autoCapitalize="words"`,
    `textContentType="name"`, max 100.
  - **Job Title** — `profile-job-title`, placeholder **"Your job title"**, max 100.
  - **Company Name** — `profile-company-name`, placeholder **"Your company"**, max 100. The label
    wraps to two lines at 402pt, as it does in #82.
  - **User Type** — `profile-user-type`, a pressable value **"<label> ⌃⌄"**: the label, then a 14pt
    `ChevronsUpDown` glyph. With no type chosen it reads **"Choose"** in `text.tertiary`
    *(designed)*. A tap opens the menu (#84): phase 3's `UserTypeMenu`, with its testIDs
    parameterised by a new `testIDPrefix` prop. Here the prefix is `profile-user-type`, giving
    `profile-user-type-menu`, `profile-user-type-option-<value>` and `profile-user-type-backdrop`.
    Onboarding keeps `onboarding-user-type`. Choosing an option closes the menu and saves at once.
    The backdrop closes it with no change.
- 16pt below, the **Company Description** card `profile-company-description-card` (#83):
  - 172pt tall, with padding 20;
  - the label **"Company Description"** in `body`;
  - below it, the multiline field `profile-company-description`: 17/22, top-aligned, no
    placeholder (#83 shows none), max 1000, `scrollEnabled` off so the card grows with the text.
    Its minimum height fills the card.
- 16pt below, the **LinkedIn** card `profile-linkedin-card` (#83). It has two rows split by a
  divider:
  - the `FormRow` **"LinkedIn Username"**, `profile-linkedin`, placeholder **"username"**,
    `autoCapitalize="none"`, `autoCorrect={false}`, max 100;
  - a 52pt row `profile-linkedin-url` in `body` `text.secondary`, reading **"linkedin.com/in/"**
    followed by the saved username, if any *(designed: #83 had none)*.
- 24pt below, the **Delete Account** card `profile-delete`:
  - 56pt tall, padding 20, `SettingsCard`;
  - the label **"Delete Account"** in `body` `destructive` `#FE4346`, and a trailing 22pt `Trash2`
    glyph in `destructive`;
  - role `button`, a11y "Delete Account". It pushes `/settings/delete-account` (§3.3).
- 12pt below, `profile-delete-note` in `secondary` 15/20 `text.secondary`, inset 28 on both
  sides: **"Deleting your account will permanently remove all your data, including data created
  in the desktop app. We’ll first check how many notes you’d lose."** (COPY.md has straight
  apostrophes here. They are typeset curly, as everywhere else in the clone.)

**Data.** The profile is `useAuth().me`, the phase-3 `GET /me` query. No new query is needed. The
fields are initialised from it once, on mount.

**Saving** *(designed: #83 notes "fields appear to save on edit")*. There is no Save button:

- A **text field** saves on `onEndEditing` (blur or Return), and only if its trimmed value differs
  from the last saved one.
  - Job title, company name, company description and LinkedIn go through `PATCH /me` with only
    that key. An empty value is sent as `null`, which clears the field.
  - **Name** goes through better-auth's `authClient.updateUser({ name })`, as onboarding's name step
    does. `ProfilePatch` refuses `name` on purpose (phase 3).
- The **user type** saves on select.
- While a save is in flight, the field stays editable. A small `ActivityIndicator`
  (`profile-saving`) shows at the right of the email line. On success, `me` is refetched
  (`queryKeys.me`), and so is the better-auth session after a name change, so that home's avatar
  initial and the chat greeting update. No toast is shown.
- **Back flushes.** Tapping `profile-back` first blurs the focused field, awaits any save it
  started, and only then navigates. So an edit typed and then abandoned with Back is kept. A
  swipe-back gesture calls the same flush from `beforeRemove`.
- **Validation** *(designed)*. Each message is a `caption` in `destructive`, placed 8pt under its
  card, and cleared by the next edit of that field. The field keeps what the user typed:
  - **Name blank** → no request, the field reverts to the saved name, and `profile-name-error`
    reads **"Your name can’t be empty."**
  - **LinkedIn** that fails `^[A-Za-z0-9-]{3,100}$` (after trimming, and after stripping a pasted
    `https://www.linkedin.com/in/` prefix and a trailing `/`) → no request, and
    `profile-linkedin-error` reads **"Use 3–100 letters, numbers or hyphens."**
  - **A failed save** (network, 5xx) → the field keeps the typed value, and `profile-save-error`
    (under the details card) reads **"Couldn’t save your changes. Try again."** The next
    `onEndEditing` retries.
- The pure helpers `profileFieldPatch(field, draft, saved)` (returning a patch, `"unchanged"` or an
  invalid result) and `normaliseLinkedin(input)` live in `features/settings/profile.ts` and are
  unit-tested.

**States.**

- **Populated** is the only state that normally shows, because `me` is always loaded by the gate
  before home.
- **Loading.** There is none, for the same reason.
- **Session outlived its user.** A `ProfileNotFound` on save is handled as phase 3 handles it: a
  silent sign-out.

### 3.3 Delete account (`delete-account-sheet`) *(designed)* — `app/settings/delete-account.tsx`

This is the phase-2 `formSheet` with `SheetChrome fit`: the grabber, the title **"Delete
account?"**, and the Close `x` (`delete-account-close`). It is presented over Profile.

The sheet makes good on the footnote's promise ("We’ll first check how many notes you’d lose"). On
open it fetches `GET /me/deletion-preview`, with no cache (`gcTime: 0`), so the number is always
current.

| State | What shows |
| --- | --- |
| **Loading** `delete-account-loading` | A centred `ActivityIndicator`, 24pt tall, where the body goes. The confirm button is disabled |
| **Ready** | `delete-account-body`, `secondary` 17/22 `text.primary`: **"You’ll lose <n> notes. This can’t be undone."** For n = 1 it reads **"You’ll lose 1 note. This can’t be undone."** For n = 0: **"You have no notes, but your profile and settings will be removed. This can’t be undone."** Then, 20pt below, `delete-account-confirm`: a `PillButton` `lg` in phase 9's `destructive` tone, reading **"Delete account"** |
| **Deleting** | The confirm button shows its spinner. Close and swipe-down are disabled (`preventRemove`), so a deletion cannot be half-watched |
| **Preview error** `delete-account-error` | **"Couldn’t check your notes. Try again."**, then a dark `PillButton` **"Try again"** (`delete-account-retry`). The confirm button is hidden: the promise was to check first |
| **Delete error** | `delete-account-error` reads **"Couldn’t delete your account. Try again."** under the confirm button, which re-enables |

**Confirm** sends `DELETE /me`.

- On **204**, the app runs `signOutLocally` and lands on `welcome-screen`. `signOutLocally` is
  `signOut`'s offline branch, extracted and named: it deletes the two SecureStore keys, notifies
  the session signal, clears the query cache and replaces the route with `/screens/welcome`. It is
  used here because the server session is already gone with the user row, so
  `authClient.signOut()` has nothing to end.
- A **404 `ProfileNotFound`** (the account was already deleted) is treated as success.

### 3.4 Notifications (`notifications-screen`) — `app/settings/notifications.tsx` (#85)

The header title is **"Notifications"**, with `notifications-back`. Below it, with no card (#85
draws the row on the page itself):

- **The row** `notifications-upcoming-row`. It has padding 16 on both sides and starts 20pt below
  the header:
  - a text column: **"Upcoming meetings"** in `body` 17/22 `text.primary`, then 4pt below,
    **"Notify me for upcoming meetings on the lock screen"** in `body` 17/22 `text.secondary`,
    wrapping to two lines;
  - the trailing toggle `notifications-upcoming-toggle` (default on), vertically aligned with the
    title line, as in #85.
- 20pt below, the **preview card** `notifications-preview` (#85):
  - inset 16, fill `bg.preview` `#0F0F0F` (a new token), radius 24, padding 16;
  - a 4pt-wide, 44pt-tall bar in `calendar.bar` `#DB35F2`, radius 2, at leading 16;
  - 12pt right of it, **"Catch up with the team"** in `rowTitle` 17/22 semibold, and 6pt below it a
    15pt `Clock` glyph and **"1:00 PM ‒ 2:00 PM"** in `secondary` 15/20 `text.primary` (the dash is
    U+2012, as COPY.md has it);
  - 16pt below, a full-width 44pt button shape with radius 14, fill `#262626` (`bg.app`), centred
    content: the Notes mark at 22pt, an 8pt gap, then **"Start Notes"** in `rowTitle`;
  - the whole card is **static**: `accessible` with the label "Notification preview", no role, and
    no touch handling.

The page has no other content. The toggle follows the §3 saving rules.

### 3.5 Chat (`chat-settings-screen`) — `app/settings/chat.tsx` (#86)

The header title is **"Chat"**, with `chat-settings-back`.

- The section header **"Dictation"**, 20pt below the header.
- A `SettingsCard` holding one taller row `chat-settings-dictation-row`. It has padding 16 and a
  minimum height of 76:
  - the `Mic` tile;
  - a text column: **"Auto-send chat dictation"** in `body`, then **"Send dictated messages when
    transcription finishes"** in `secondary` 15/20 `text.secondary`;
  - the toggle `chat-settings-auto-send` (default on).

### 3.6 Phone calls (`phone-calls-screen`) — `app/settings/phone-calls.tsx` (#87)

The header title is **"Phone Call Settings"**, with `phone-calls-back`. The content, Get Started
included, is one column centred vertically under the header, as #87 draws it:

- a 64pt ring: a 4pt `olive.ring` `#515B1F` stroke (a new token), a transparent fill, and a 30pt
  filled `Phone` glyph in `olive` `#677B00`;
- 24pt below, **"Make Calls From Notes"** (`phone-calls-title`), serif `displaySheet` 34/40,
  centred;
- 24pt below, a card (fill `bg.app`, hairline, radius 28, inset 24) with two 76pt rows split by a
  full-width hairline divider. Each row has a 40pt round tile (fill `olive.dark`, glyph in
  `olive.glyph` `#8A9A2A`, which is the olive glyph colour the README names) and `body` text:
  - `FileText` — **"Get notes from your outbound phone calls"**
  - `AudioLines` — **"Keep track of what’s said during your phone calls"**
- 24pt below, `phone-calls-get-started`: a light `PillButton` `lg`, inset 24, reading **"Get
  Started"** with a trailing `ArrowRight`. *(designed)* A tap shows the toast **"Phone calls are
  coming soon."** Nothing else happens.

### 3.7 Watch (`watch-screen`) — `app/settings/watch.tsx` (#88)

The header holds Back only (`watch-back`), with no title.

- **"Apple Watch"** (`watch-title`), serif `display` 40/46, centred, 24pt below the header.
- 24pt below, a 96pt disc (fill `bg.tileRaised` at 60%) holding a drawn watch. It is a 44×54
  rounded rectangle, radius 12, in `#1E1E1E` with a hairline, and its screen is a 36×40 `lime`
  rectangle, radius 8, showing **"0:07:26"** in 11pt semibold `#1A1A1A`. It is decorative and
  `accessible={false}`.
- 16pt below, **"No Apple Watch found"** (`watch-status`) in `body` `text.primary`, centred, then
  2pt below **"Pair a watch to continue."** in `body` `text.secondary`.
- 32pt below, an info card (fill `bg.app`, hairline, radius 28, inset 20, padding 20) with
  **"Pair an Apple Watch with this iPhone to use Notes from your wrist."** (`watch-info`) in
  `body` `text.secondary`, centred.

The page is static in every state.

### 3.8 Report a bug (`report-bug-sheet`) — `app/settings/report-bug.tsx` (#90)

`presentation: "modal"`: the page sheet with top radius 40 and fill `bg.app`. Swipe-down equals
Close.

- **The nav row**, 16pt below the sheet top:
  - **Close** `report-bug-close`: a dark outlined `PillButton` `md` (fill `bg.app`, 1pt `#333`
    border), at leading 20.
  - **"Report a bug"** in `title` 20/25 semibold, centred.
  - **Send** `report-bug-send`: a `PillButton` `md` at trailing 20.
    - It is disabled with the phase-9 `solid` disabled look (`button.disabled` `#555555`, label
      `#1A1A1A`) until the trimmed message is non-empty.
    - When enabled it uses the `light` tone (`button.light`).
- **"Describe the bug"** section header, 24pt below.
- **The message card** `report-bug-message-card` (`SettingsCard`, padding 20, minimum height 300):
  - the prompt **"What steps led to this bug, and what happened versus what you expected?"** in
    `body` `text.secondary`;
  - 16pt below, a hairline divider;
  - 16pt below, the multiline field `report-bug-message`: 17/26, with the placeholder in
    `text.tertiary` reading **"Steps:\n\nExpected:\n\nActual:\n\nAttempts to fix:"**. It is a
    placeholder, not prefilled text. `autoFocus` is off, so #90's resting look is what opens. Max
    5000.
- **"Diagnostics"** section header, 32pt below.
- **The diagnostics card**: one row, padding 16, minimum height 96:
  - the `FileText` tile;
  - a text column: **"Include recent app diagnostics"** (`body`, two lines at this width, as in
    #90), then **"Shares up to 7 days of logs with the Notes team to help us debug faster. This
    doesn’t include your transcript or notes."** in `secondary` 15/20 `text.secondary`;
  - the **lime** toggle `report-bug-diagnostics` (track `lime.switch` when on), default on. It is
    local form state and is not stored.

**Send** posts `POST /support/bug-reports { message, includeDiagnostics, appVersion }`. The
`appVersion` is the settings footer's `VERSION` string, moved into `features/settings/version.ts`.

| State | What shows |
| --- | --- |
| **Idle** | As above |
| **Sending** | Send shows its spinner. The field and the toggle are disabled. Close is disabled, and swipe-down is prevented |
| **Sent** *(designed)* | The sheet closes, and a toast on Settings reads **"Thanks — your report was sent."** |
| **Failed** *(designed)* | The sheet stays open with the text kept. `report-bug-error`, a `caption` in `destructive` 8pt under the message card, reads **"Couldn’t send your report. Try again."** Editing clears it |

**Closing with text typed** asks nothing. That matches phase 4's editor close, and discovery closed
this sheet empty. The draft is lost.

### 3.9 Send feedback (`feedback-sheet`) *(designed)* — `app/settings/feedback.tsx`

Discovery's Send feedback handed off to the Mail app with a prefilled compose (COPY.md). The
clone cannot do that: the simulator has no Mail app, and every email provider must be a fake. So
it is the bug form's sibling, `features/settings/SupportForm.tsx`, one component with two configs:

- the title **"Send feedback"**; Close is `feedback-close` and Send is `feedback-send`;
- the section header **"Your feedback"**;
- the prompt **"What’s working, what isn’t, and what would you like to see?"**;
- the field `feedback-message`, with the placeholder **"Write your feedback here..."** (max 5000);
- **no Diagnostics section**.

Send posts `POST /support/feedback { message, appVersion }`. The states are §3.8's, with the sent
toast **"Thanks for your feedback."** and the error **"Couldn’t send your feedback. Try again."**
(`feedback-error`).

### 3.10 Get desktop (`desktop-sheet`) — `app/desktop.tsx` (#51, #89)

`presentation: "formSheet"` at the `large` detent, with the grabber (`sheetGrabberVisible`), top
radius 40 and fill `bg.app` `#252525`–`#2A2A2A` (`bg.sheet`). It is presented from home's
`home-get-desktop-button` (which until now did nothing) and from `settings-desktop-banner`.

- **The hero** `desktop-hero`. It covers the top 266pt (re-measured off #51 in review), with the
  fill `hero.pink` `#E78BCE`:
  - It carries three thin (1pt) `#1A1A1A`-at-60% lines, drawn with `react-native-svg` (already a
    dependency). They run from (0, 58) to (180, 0), from (0, 133) to (88, 0), and from (100, 0) to
    (106, 66), x in 428pt coordinates scaled to the width. They are clipped to the hero.
  - A cropped light window mock (`#FCFDF8`, top-left radius 20) starts 66pt down and 73pt in, and
    runs off the right edge. Its page text is inset 53pt. It holds:
    - the three traffic-light dots, 12pt, `#FE5F57` `#FEBC2E` `#28C840`, at (13, 13);
    - serif **"Sprint Planning"** at 28pt in `#1A1A1A`;
    - a meta line at 11pt `#6B6B6B`: **"Yesterday · 5 attendees · Select folder ⌄"**, each part with
      a 10pt lucide glyph (`CalendarCheck`, `Users`, `Folder`), fitting inside the window so the
      chevron shows;
    - **"Overview of the Notes notepad and transcri…"** at 15pt semibold `#1A1A1A`, its grey "#"
      hanging 17pt to the left;
    - **"Introduction to Notes features by Sam Stephen…"** at 15pt `#1A1A1A`, and a bullet line
      under it that the hero's foot cuts, as #51's does.
  - The whole hero is decorative and `accessible={false}`.
- **"Meeting notes on your computer"** (`desktop-title`), serif `display` 40/46, centred, inset
  40, on two lines. It, the body and the tiles are one block, centred vertically between the hero
  and Done, as #51 places them.
- 12pt below, `desktop-body` in `body` `text.secondary`, centred: **"Take notes on video calls
  with Notes for Mac or Windows."**
- 28pt below, **two tiles** in a row, inset 16 with a 12pt gap. Each tile is 108pt tall, with fill
  `bg.list` `#1A1A1A` and radius 24. A 44pt circle sits 18pt from the top, and the label
  `rowTitle` sits 12pt under it:
  - `desktop-share`: the circle in `tile.share` `#ADC06F` with a 20pt `Share` glyph in `#1A1A1A`,
    and **"Share link"**. It calls `Share.share({ message: DESKTOP_SHARE_MESSAGE, url:
    LINKS.desktop })`.
  - `desktop-remind`: the circle in `tile.remind` `#8EBCEC` with a `CalendarDays` glyph, and
    **"Remind me later"** *(designed outcome)*. It sends `POST /me/desktop-reminder`, then:
    - on success, the sheet closes and the toast reads **"We’ll email you a link to get Notes on
      your computer."**
    - on failure, the sheet stays open and the toast reads **"Couldn’t set a reminder. Try
      again."**
    - While the request is in flight, the circle's glyph is replaced by a spinner and both tiles
      are disabled.
- Pinned 16pt above the bottom safe area, `desktop-done`: a full-width dark pill `lg`, inset 24,
  fill `bg.list`, reading **"Done"**. It closes the sheet.

The sheet has one state. It makes no request until **Remind me later** is tapped.

### 3.11 Work-email upsell (`work-email-sheet`) — `app/work-email.tsx` (#04)

`presentation: "modal"`: the full-height page sheet with top radius 40 and fill `bg.sheet`
`#252525`. Discovery's grain texture is not reproduced (§10). It opens from `home-events-card`,
which until now did nothing. Swipe-down dismisses it.

The content sits in a column, centred vertically in the space above the buttons (#04):

- the Notes mark at 42pt, `text.primary` (`work-email-mark`);
- 24pt below, **"Much better with your work email"** (`work-email-title`), serif `display` 40/46,
  centred, inset 40, on two lines;
- 16pt below, `work-email-body` in `body` `text.primary`, centred, inset 28. The copy depends on
  the address (§4):
  - When the address is a known personal provider: **"It looks like you’ve connected a
    <Provider> account. If you don’t use this for work, you won’t see your meetings in Notes."**
  - When it is not *(designed)*: **"Sign up with the email you use for work to see your meetings
    in Notes."**
  - The pure `personalEmailProvider(email)` in `features/settings/workEmail.ts` returns
    `"Gmail" | "Outlook" | "iCloud" | "Yahoo" | null`, from the domain after `@`, lower-cased:
    - `gmail.com` and `googlemail.com` → Gmail;
    - `outlook.com`, `hotmail.com` and `live.com` → Outlook;
    - `icloud.com`, `me.com` and `mac.com` → iCloud;
    - `yahoo.com` → Yahoo.
    It is unit-tested. The seeded users are `@gcnotes.test`, so the flows see the designed copy.
- 32pt below, the **benefits card** `work-email-benefits`. It is inset 16, with fill `bg.list`
  `#1A1A1A`, a hairline, and radius 24. It has two 72pt rows split by a full-width hairline. Each
  row has, at leading 16, a 40pt round tile with a 1pt `#333` border (no fill), holding a 20pt
  glyph, then a 16pt gap and `body` text:
  - `CalendarDays` — **"Connect your notes to your meetings"**
  - `Users` — **"Quickly share notes with teammates"**

Pinned to the bottom, above the safe area:

- `work-email-sign-up`: a light `PillButton` `lg`, inset 24, 56pt tall, with a leading `Mail`
  glyph and **"Sign up with work email"**. *(designed)* A tap closes the sheet and runs
  `useSignOut()`, landing on `welcome-screen` with an empty email field. That is the only way the
  clone can start an account under another address. No confirmation is shown, which is phase 3's
  rule for sign-out.
- 20pt below, `work-email-continue`: phase 3's `TextButton`, reading **"Continue anyway"** in
  `rowTitle` `text.secondary`. *(designed)* A tap closes the sheet. Nothing is persisted, and the
  card stays on home, because until phase 11 it is the only calendar state there is.

---

## 4. Copy

Every string is from COPY.md, with the product name replaced by **Notes**, except those marked
*(designed)*. Curly quotes and apostrophes are used throughout.

| Where | Copy |
| --- | --- |
| Settings title | Settings |
| Banner | Get Notes for Mac or Windows |
| Sections | Account · Features · Support · Data & sharing |
| Account rows | Profile · Notifications · Subscription · badge "Coming soon" |
| Features rows | Chat · Phone calls · Watch |
| Support rows | Send feedback · Report a bug · Help center · Share Notes for iPhone · Recover Corrupted Notes |
| Recover toast *(designed)* | No corrupted notes found. |
| Data & sharing | Use my data to improve models for everyone · Your data is anonymized and used to improve the experience for Notes users · Learn more · Use my data · Privacy policy |
| Sign out, version | Sign out · 1.0.0 (1) |
| Share-app message *(designed)* | Notes turns your meetings into notes you can search and ask about. Get it for iPhone: https://notes.example/iphone |
| Profile | Your profile · Notes works best when it knows a little about you. Make sure this is correct to get the most out of Notes. |
| Profile fields | Name · Job Title ("Your job title") · Company Name ("Your company") · User Type · Company Description · LinkedIn Username ("username") · linkedin.com/in/ |
| Name placeholder, no user type *(designed)* | Your name · Choose |
| User types | Investing · Recruiting · Customer Facing · Startup/Generalist · Other |
| Delete | Delete Account · Deleting your account will permanently remove all your data, including data created in the desktop app. We’ll first check how many notes you’d lose. |
| Profile errors *(designed)* | Your name can’t be empty. · Use 3–100 letters, numbers or hyphens. · Couldn’t save your changes. Try again. |
| Delete sheet *(designed)* | Delete account? · You’ll lose <n> notes. This can’t be undone. · You’ll lose 1 note. This can’t be undone. · You have no notes, but your profile and settings will be removed. This can’t be undone. · Delete account · Couldn’t check your notes. Try again. · Try again · Couldn’t delete your account. Try again. |
| Notifications | Notifications · Upcoming meetings · Notify me for upcoming meetings on the lock screen · Catch up with the team · 1:00 PM ‒ 2:00 PM · Start Notes |
| Chat | Chat · Dictation · Auto-send chat dictation · Send dictated messages when transcription finishes |
| Toggle failure *(designed)* | Couldn’t save this setting. Try again. · Retry |
| Phone calls | Phone Call Settings · Make Calls From Notes · Get notes from your outbound phone calls · Keep track of what’s said during your phone calls · Get Started |
| Phone toast *(designed)* | Phone calls are coming soon. |
| Watch | Apple Watch · No Apple Watch found · Pair a watch to continue. · Pair an Apple Watch with this iPhone to use Notes from your wrist. |
| Report a bug | Close · Report a bug · Send · Describe the bug · What steps led to this bug, and what happened versus what you expected? · Steps:\n\nExpected:\n\nActual:\n\nAttempts to fix: · Diagnostics · Include recent app diagnostics · Shares up to 7 days of logs with the Notes team to help us debug faster. This doesn’t include your transcript or notes. |
| Bug outcomes *(designed)* | Thanks — your report was sent. · Couldn’t send your report. Try again. |
| Feedback *(designed)* | Send feedback · Your feedback · What’s working, what isn’t, and what would you like to see? · Write your feedback here... · Thanks for your feedback. · Couldn’t send your feedback. Try again. |
| Get desktop | Meeting notes on your computer · Take notes on video calls with Notes for Mac or Windows. · Share link · Remind me later · Done |
| Desktop hero mock | Sprint Planning · Yesterday · 5 attendees · Select folder · # Overview of the Notes notepad and transcri… · Introduction to Notes features by Sam Stephen… |
| Desktop outcomes *(designed)* | Share message: "Get Notes for Mac or Windows: https://notes.example/desktop" · We’ll email you a link to get Notes on your computer. · Couldn’t set a reminder. Try again. |
| Work email | Much better with your work email · It looks like you’ve connected a <Provider> account. If you don’t use this for work, you won’t see your meetings in Notes. · Connect your notes to your meetings · Quickly share notes with teammates · Sign up with work email · Continue anyway |
| Work email, non-personal *(designed)* | Sign up with the email you use for work to see your meetings in Notes. |

**Emails sent through the fake `Email` port** *(designed)*:

- **Bug report.**
  - To: `SUPPORT_ADDRESS` `support@notes.example`.
  - Subject: **"Bug report from Notes <appVersion> | <caller email>"**.
  - Body: the message, then a blank line and **"Diagnostics: included"** or **"Diagnostics: not
    included"**, then **"From: <name> <email>"**.
- **Feedback.**
  - To: `SUPPORT_ADDRESS`.
  - Subject: **"Feedback on Notes <appVersion> | <caller email>"**, which is COPY.md's subject with
    the name swapped.
  - Body: the message, then a blank line and **"Sincerely,\n<name>"**, as the discovered compose
    signs it.
- **Desktop reminder.**
  - To: the caller.
  - Subject: **"Get Notes for Mac or Windows"**.
  - Body: **"Here’s the link you asked for. Open it on your computer to download Notes:
    https://notes.example/desktop"**.

**Links** (`features/settings/links.ts`, one constant object, *designed placeholders*):

| Key | URL |
| --- | --- |
| `help` | `https://notes.example/help` |
| `learnMore` | `https://notes.example/data` |
| `privacy` | `https://notes.example/privacy` |
| `desktop` | `https://notes.example/desktop` |
| `iphone` | `https://notes.example/iphone` |

---

## 5. testIDs

| Screen | IDs |
| --- | --- |
| Settings | `settings-screen`, `settings-back`, `settings-scroll`, `settings-desktop-banner`, `settings-section-account`, `settings-profile`, `settings-notifications`, `settings-subscription`, `settings-subscription-badge`, `settings-section-features`, `settings-chat`, `settings-phone-calls`, `settings-watch`, `settings-section-support`, `settings-feedback`, `settings-report-bug`, `settings-help`, `settings-share-app`, `settings-recover`, `settings-section-data`, `settings-data-learn-more`, `settings-data-privacy`, `settings-use-my-data` (+ `-loading`, `-retry`), `settings-sign-out`, `settings-version` |
| Profile | `profile-screen`, `profile-back`, `profile-scroll`, `profile-title`, `profile-lead`, `profile-avatar`, `profile-email`, `profile-saving`, `profile-details`, `profile-name`, `profile-name-error`, `profile-job-title`, `profile-company-name`, `profile-user-type`, `profile-user-type-menu`, `profile-user-type-option-<value>`, `profile-user-type-backdrop`, `profile-save-error`, `profile-company-description-card`, `profile-company-description`, `profile-linkedin-card`, `profile-linkedin`, `profile-linkedin-url`, `profile-linkedin-error`, `profile-delete`, `profile-delete-note` |
| Delete sheet | `delete-account-sheet`, `delete-account-close`, `delete-account-loading`, `delete-account-body`, `delete-account-confirm`, `delete-account-error`, `delete-account-retry` |
| Notifications | `notifications-screen`, `notifications-back`, `notifications-upcoming-row`, `notifications-upcoming-toggle` (+ `-loading`, `-retry`), `notifications-preview` |
| Chat | `chat-settings-screen`, `chat-settings-back`, `chat-settings-dictation-row`, `chat-settings-auto-send` (+ `-loading`, `-retry`) |
| Phone calls | `phone-calls-screen`, `phone-calls-back`, `phone-calls-title`, `phone-calls-get-started` |
| Watch | `watch-screen`, `watch-back`, `watch-title`, `watch-status`, `watch-info` |
| Report a bug | `report-bug-sheet`, `report-bug-close`, `report-bug-send`, `report-bug-message-card`, `report-bug-message`, `report-bug-diagnostics`, `report-bug-error` |
| Feedback | `feedback-sheet`, `feedback-close`, `feedback-send`, `feedback-message`, `feedback-error` |
| Get desktop | `desktop-sheet`, `desktop-hero`, `desktop-title`, `desktop-body`, `desktop-share`, `desktop-remind`, `desktop-done` |
| Work email | `work-email-sheet`, `work-email-mark`, `work-email-title`, `work-email-body`, `work-email-benefits`, `work-email-sign-up`, `work-email-continue` |
| Existing, reused | `home-settings-button`, `home-get-desktop-button`, `home-events-card`, `home-avatar-initial`, `toast-message`, `toast-action`, `welcome-screen`, `welcome-email`, `onboarding-name-screen` |

---

## 6. API

### 6.1 Routes

All routes are session-authenticated (`security: [{ sessionCookie: [] }]`), and every handler is one
expression (R6).

| Route | Context / name | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /me/settings` | `Settings` — `getSettingsRoute` | — | 200 `UserSettings`. With no stored row, the defaults (all `true`). Reading never writes | 401 |
| `PATCH /me/settings` | `Settings` — `patchSettingsRoute` | body `UserSettingsPatch` (strict; each key an optional boolean) | 200 `UserSettings` after the patch. `{}` is a no-op that writes nothing and returns the current values | 401; 422 (non-boolean, or an unknown key) |
| `GET /me/deletion-preview` | `Profile` — `getDeletionPreviewRoute` | — | 200 `DeletionPreview` `{ noteCount }`: the caller's **live** notes. Trashed ones are not counted, because the user cannot see them | 401; 404 `ProfileNotFound` |
| `DELETE /me` | `Profile` — `deleteMeRoute` | — | 204, no body. It deletes the better-auth `user` row, and FK cascades take sessions, accounts, profiles, settings, notes, recordings, generations, chats and folders | 401; 404 `ProfileNotFound` |
| `POST /support/bug-reports` | `Support` — `createBugReportRoute` | body `BugReportCreate` `{ message, includeDiagnostics, appVersion }` (strict) | 202 `SupportReceipt` `{ id }`, the outbox message id | 401; 422; 503 `EmailUnavailable` (the port's existing error) |
| `POST /support/feedback` | `Support` — `createFeedbackRoute` | body `FeedbackCreate` `{ message, appVersion }` (strict) | 202 `SupportReceipt` | 401; 422; 503 |
| `POST /me/desktop-reminder` | `Support` — `createDesktopReminderRoute` | — | 202 `SupportReceipt` | 401; 404 `ProfileNotFound`; 503 |
| `GET /e2e/support?kind=` | E2E harness, behind the secret, not in OpenAPI | query `kind: "bug-report" \| "feedback" \| "desktop-reminder"` | 200 `{ items: { to, subject, body, payload, createdAt }[] }`, newest first, at most 10 | 401 without the secret; 422 on another kind |

`DELETE /me` is ours, not better-auth's `delete-user`. The domain has to answer
`ProfileNotFound`, be covered by a service test over `makeTestD1()`, and live beside the preview
that promises the count. better-auth's `user.deleteUser` stays disabled, so there is one way to
delete an account.

### 6.2 Shapes

```ts
// packages/domain/src/Domain/Settings.ts
export const UserSettings = z.object({
  chatDictationAutoSend: z.boolean(),
  notifyUpcomingMeetings: z.boolean(),
  useDataForTraining: z.boolean(),
});
export const SETTINGS_DEFAULTS: UserSettings = {      // DATA-MODEL.md: all three observed on
  chatDictationAutoSend: true,
  notifyUpcomingMeetings: true,
  useDataForTraining: true,
};
export const UserSettingsPatch = z.strictObject({
  chatDictationAutoSend: z.boolean().optional(),
  notifyUpcomingMeetings: z.boolean().optional(),
  useDataForTraining: z.boolean().optional(),
});

// packages/domain/src/Domain/Support.ts
export const SUPPORT_MESSAGE_MAX = 5000;
export const SUPPORT_ADDRESS = "support@notes.example";
const SupportMessage = z.string().trim().min(1).max(SUPPORT_MESSAGE_MAX);
const AppVersion = z.string().trim().min(1).max(40);        // "1.0.0 (1)"
export const BugReportCreate = z.strictObject({
  appVersion: AppVersion,
  includeDiagnostics: z.boolean(),
  message: SupportMessage,
});
export const FeedbackCreate = z.strictObject({ appVersion: AppVersion, message: SupportMessage });
export const SupportReceipt = z.object({ id: z.string().min(1) });

// packages/domain/src/Domain/Profile.ts (added)
export const DeletionPreview = z.object({ noteCount: z.number().int().min(0) });
```

`Integrations/Email/Port.ts`: `EmailKind` widens to
`"otp" | "bug-report" | "feedback" | "desktop-reminder"`. The payloads are:

- `bug-report`: `{ appVersion, includeDiagnostics: "true" | "false", from: email }`;
- `feedback`: `{ appVersion, from }`;
- `desktop-reminder`: `{ link }`.

`send` returning the outbox id would leak the fake into the port, so the service mints the
receipt id from `ids` (`sup_<nanoid16>`) and passes it in the payload as `receiptId`. `EmailFake`
keeps its own row id.

### 6.3 Storage and rules

**Table** (`packages/db/src/schema/user-settings.ts`, keys alphabetical, epoch-ms). The migration
is `0009_user_settings.sql`, from `db:generate`:

```
user_settings
  chatDictationAutoSend   chat_dictation_auto_send   integer (boolean mode) not null
  notifyUpcomingMeetings  notify_upcoming_meetings   integer (boolean mode) not null
  updatedAt               updated_at                 integer not null
  useDataForTraining      use_data_for_training      integer (boolean mode) not null
  userId                  user_id                    text primary key references user(id) on delete cascade
```

`RESET_ORDER` gains `userSettings` next to `chatPreferences`, before `profiles`.

**Rules.** The services decide; the repositories only do I/O (R2).

- **Settings.**
  - `SettingsService.get` returns the stored row, or `SETTINGS_DEFAULTS` when there is none.
  - `update` with an empty patch returns `get` and writes nothing.
  - Otherwise it upserts: `insert … values (defaults merged with the patch) on conflict (user_id) do
    update set <only the patched columns>, updated_at = now`. So two concurrent patches of
    different keys both land.
  - The context is `Settings/`: `SettingsRepo`, `Policy` (`canEditSettings(actor, userId)` returns
    `Authorized<UserId>`), `SettingsService` (deps `clock`, `repo`) and `Http`.
- **Deletion preview.** `ProfilesService.deletionPreview(actor)` first reads the profile
  (`ProfileNotFound`), then calls `notes.countLive(ownerId)`. That is a type-only
  `Pick<NotesRepo, "countLive">` dependency, and `NotesRepo.countLive` is new: a `count(*)` over
  the partial index `notes_owner_live_idx`.
- **Delete.**
  - `ProfilesService.deleteAccount(actor)` checks the edit policy on the existing profile, then calls
    `repo.deleteUser(id)`. On `false` (no row was deleted) it raises `ProfileNotFound`.
  - `ProfilesRepo.deleteUser` is the one write this repo makes to better-auth's `user` table, and
    its header comment is amended to say so and why (§6.1). It deletes `user where id = ?` and
    returns `meta.changes === 1`.
  - Every domain table already cascades from `user.id` (verified: notes, recordings,
    note_generations, chat_threads, chat_messages, chat_preferences, folders, profiles, session,
    account). `note_attendees.user_id` is a nullable reference and is left to its declared
    behaviour.
  - `email_outbox` rows addressed to the user are not deleted. They exist only in the fake.
  - R2 audio is the existing phase-5 blocker ("Audio objects outlive a deleted user"), and it is
    referenced rather than duplicated.
- **Support.**
  - `SupportService` has the deps `clock`, `ids`, `email: EmailPort`, and a type-only
    `profiles: Pick<ProfilesRepo, "byId">`, which gives the sender's name and email for the body
    and subject. A missing profile raises `ProfileNotFound`.
  - It renders the message (§4), mints `sup_…`, and calls `email.send`. The port's
    `EmailUnavailable` propagates as a 503.
  - There is no rate limit (§10).
  - `includeDiagnostics` is recorded as a line in the body and a payload flag. No logs exist to
    attach.
- **Harness.** `GET /e2e/support` reads `email_outbox where kind = ?`, ordered by `created_at
  desc, id desc`, with a limit of 10, through `E2eRepo`.

### 6.4 Client (`packages/apiclient`)

- **`settings.ts`**: `getSettings`, `patchSettings`, each `endpoint<typeof …Route>`.
- **`support.ts`**: `createBugReport`, `createFeedback`, `createDesktopReminder`.
- **`profiles.ts`** gains `getDeletionPreview` and `deleteMe`.
- **Query keys** (`query-keys.ts`):
  - `settings: { all: ["settings"], me: () => ["settings", "me"] }`;
  - `profile.deletionPreview: () => ["me", "deletion-preview"]`.
- **Invalidation:**
  - `patchSettings: () => [settings.all]`. The toggles also write the returned value straight into
    the cache (`setQueryData`), so a slow refetch cannot flip one back.
  - `deleteMe` invalidates nothing: the client clears the whole cache.

### 6.5 Seed

The **base seed does not change**. No user has a `user_settings` row, so every flow meets the
defaults (all on), and toggling is the first write. `person` still has three live notes
(`not_e2e_launch`, `not_e2e_standup` and `not_e2e_solo`) and one trashed (`not_e2e_archived`), so
the delete preview reads **3 notes**. `empty` reads 0. Phase 3's `E2eRepo.stageUsers` already
re-creates a deleted `person` under its fixed id on the next reset and seed.

---

## 7. API test cases

`Settings/Settings.test.ts` (the service over `makeTestD1()`, `fixedClock` and `sequentialIds`):

1. **Defaults.** `get(person)` with no row returns all `true`, and no row exists afterwards.
2. **Patch writes one key.** Patching `{ notifyUpcomingMeetings: false }` returns
   `{ false, true, true }`, and one row now exists with `updatedAt === clock`. A second
   `get` agrees.
3. **Keys are independent.** After test 2, patching `{ useDataForTraining: false }` leaves
   `notifyUpcomingMeetings` false and `chatDictationAutoSend` true.
4. **Empty patch.** `{}` on a user with no row returns the defaults and creates no row. On a user
   with a row, it leaves `updatedAt` unmoved.
5. **Isolation.** `person`'s patch is not visible to `other`, whose settings are still the
   defaults.
6. **Cascade.** Deleting the user row removes the settings row.

`Profiles/Profiles.test.ts` (extended):

7. **Preview.** `deletionPreview(person)` gives `{ noteCount: 3 }`, excluding the trashed note.
   `empty` gives 0. After trashing launch, `person` gives 2.
8. **Delete.** `deleteAccount(person)` succeeds, and afterwards:
   - `me(person)` raises `ProfileNotFound`;
   - `person`'s notes, folders, chat threads, profile and settings rows are all gone;
   - `person`'s sessions are gone;
   - `other`'s notes and profile are untouched.
9. **Delete twice.** A second `deleteAccount(person)` raises `ProfileNotFound`.
10. **Preview after delete.** `deletionPreview` for a deleted actor raises `ProfileNotFound`.

`Support/Support.test.ts` (with `EmailFake`, which records its calls):

11. **Bug report.** It sends exactly one `bug-report` message:
    - to `support@notes.example`;
    - with the subject `Bug report from Notes 1.0.0 (1) | e2e-person@gcnotes.test`;
    - with a body that contains the trimmed message, `Diagnostics: included`, and `From: E2E Person
      e2e-person@gcnotes.test`;
    - with `payload.includeDiagnostics === "true"`, and a receipt id that starts `sup_` and matches
      `payload.receiptId`.
12. **Diagnostics off.** With `includeDiagnostics: false`, the body says `Diagnostics: not
    included`.
13. **Feedback.** The subject is `Feedback on Notes 1.0.0 (1) | e2e-person@gcnotes.test`, and the
    body ends `Sincerely,\nE2E Person`.
14. **Desktop reminder.** It goes to the caller's own address, with the subject `Get Notes for Mac
    or Windows` and `payload.link === "https://notes.example/desktop"`.
15. **Failure propagates.** With the fake scripted to raise `EmailUnavailable`, all three raise it,
    and nothing is recorded as sent.
16. **Domain.** `BugReportCreate` rejects `"   "`, 5001 characters, a missing `includeDiagnostics`
    and an extra key. It trims the message. This lives in `Domain/Support.test.ts`, which also
    tests `UserSettingsPatch`'s strictness.

`E2E/E2E.test.ts`: `GET /e2e/support?kind=bug-report` returns the report from test 11, newest
first. `kind=otp` is a 422. After a reset, the list is empty.

The HTTP suites cover wire shape, not rules:

- `Settings/Settings.http.test.ts`:
  - `GET` answers 200 and parses as `UserSettings`, and 401 without a session;
  - `PATCH { notifyUpcomingMeetings: false }` answers 200;
  - `PATCH` answers 422 on `{ notifyUpcomingMeetings: "no" }` and on `{ extra: true }`.
- `Profiles/Profiles.http.test.ts`:
  - `GET /me/deletion-preview` answers 200 and parses;
  - `DELETE /me` answers 204 with an empty body, and a following `GET /me` with the same cookie
    answers 401, because the session cascaded away;
  - both answer 401 without a session.
- `Support/Support.http.test.ts`:
  - both `POST` routes answer 202 and parse as `SupportReceipt`, and 422 on `{}` and on an extra
    key;
  - `POST /me/desktop-reminder` answers 202;
  - `EmailUnavailable` maps to 503;
  - all three answer 401 without a session.
- `apps/api` `app.test.ts`: `/me/settings` and `/support/*` are mounted, and the OpenAPI document
  lists the `Settings` and `Support` tags and the two new `Profile` routes. `/e2e/support` is
  absent from the document.

---

## 8. Acceptance criteria and flows

**Flow setup.**

- Every flow starts from `clearState`, `clearKeychain` and reset/seed, and signs in fast as
  `person` through `subflows/open-home.yaml`.
- The tags are `phase-10` and `regression`. `profile-edit.yaml`, `toggle-persists.yaml`,
  `sign-out.yaml` and `delete-account.yaml` are also tagged `smoke`, because they are the phase's
  exit criteria.
- Flows select by `id`, and text is asserted only as a property of an id. There is no `sleep`:
  every wait is `extendedWaitUntil`.
- A settings row below the fold is reached with `scrollUntilVisible` on `settings-scroll`, and the
  target is kept small, as phase 4's gallery note requires.
- `config.yaml` gains `phase-10/*`.

**New Maestro pieces:**

- `subflows/open-settings.yaml`: taps `home-settings-button` and waits for `settings-screen`.
- `subflows/open-settings-row.yaml` (`ROW`): runs `open-settings.yaml`, scrolls until `ROW` is
  visible, and taps it.
- `scripts/e2e-support.js` (`KIND`, `EXPECT_SUBJECT`, `EXPECT_BODY`): `GET /e2e/support?kind=`.
  It throws unless the newest item's subject equals `EXPECT_SUBJECT` and its body contains
  `EXPECT_BODY`. It is run through `runScript`, as `e2e-folders.js` is.

| # | Given / When / Then | Flow |
| --- | --- | --- |
| AC1 | **Given** `person` on home, **when** they tap `home-settings-button`, **then** `settings-screen` shows `settings-desktop-banner` "Get Notes for Mac or Windows", `settings-profile`, `settings-notifications`, and `settings-subscription` with `settings-subscription-badge` "Coming soon". **When** they tap `settings-subscription`, **then** `settings-screen` is still shown and no other screen appeared. Then `settings-chat`, `settings-phone-calls`, `settings-watch`, `settings-feedback`, `settings-report-bug`, `settings-help`, `settings-share-app` "Share Notes for iPhone" and `settings-recover` are visible after scrolling. **When** they tap `settings-recover`, **then** `toast-message` reads "No corrupted notes found.". **When** they scroll to the end, **then** `settings-use-my-data` is `selected: true`, and `settings-sign-out` and `settings-version` "1.0.0 (1)" are visible. | `apps/native/.maestro/phase-10/settings-list.yaml` |
| AC2 — **exit: profile persists** | **Given** `person` opens `settings-profile`, **then** `profile-title` reads "Your profile", `profile-email` reads "e2e-person@gcnotes.test", `profile-name` "E2E Person", `profile-job-title` "Engineer", `profile-company-name` "Notes E2E" and `profile-user-type` "Startup/Generalist". **When** they replace the name with "Riley Park", the job title with "Designer" and the company with "Acme", tap `profile-user-type` and then `profile-user-type-option-investing`, type "We build tools." into `profile-company-description` and "riley-park" into `profile-linkedin`, then tap `profile-back`, **then** `settings-screen` is visible. **When** they go back home, **then** `home-avatar-initial` reads "R". **When** the app is relaunched (`relaunch-app.yaml`, Keychain kept) and they open Profile, **then** every field shows the new value, `profile-user-type` reads "Investing", and `profile-linkedin-url` reads "linkedin.com/in/riley-park". | `apps/native/.maestro/phase-10/profile-edit.yaml` |
| AC3 | **Given** Profile open, **when** they clear `profile-name` and tap `profile-job-title`, **then** `profile-name-error` reads "Your name can’t be empty." and `profile-name` reads "E2E Person" again. **When** they type "a b" into `profile-linkedin` and tap `profile-job-title`, **then** `profile-linkedin-error` reads "Use 3–100 letters, numbers or hyphens.". **When** they replace it with "https://www.linkedin.com/in/e2e-person/" and tap `profile-job-title`, **then** the error is gone and `profile-linkedin` reads "e2e-person". **When** they clear `profile-job-title`, go back and reopen Profile, **then** `profile-job-title` shows its placeholder "Your job title". | `apps/native/.maestro/phase-10/profile-validation.yaml` |
| AC4 — **exit: a toggle persists** | **Given** `person` opens `settings-notifications`, **then** `notifications-upcoming-toggle` is `selected: true`, and `notifications-preview` is visible. **When** they tap it, **then** it is `selected: false`. **When** the app is relaunched and they open Notifications again, **then** it is still `selected: false`. **When** they tap it again, go back and reopen, **then** it is `selected: true`. | `apps/native/.maestro/phase-10/toggle-persists.yaml` |
| AC5 | **Given** `person` opens `settings-chat`, **then** `chat-settings-auto-send` is `selected: true`. **When** they tap it and go back, **then** on reopening Chat it is `selected: false`. **When** they return to Settings and scroll to `settings-use-my-data` and tap it, **then** it is `selected: false`. After relaunching and reopening Settings, it is still `selected: false`, and Chat's toggle is still `selected: false`. | `apps/native/.maestro/phase-10/other-toggles.yaml` |
| AC6 | **Given** `person` opens `settings-report-bug`, **then** `report-bug-sheet` shows `report-bug-send` `enabled: false` and `report-bug-diagnostics` `selected: true`. **When** they type "   " into `report-bug-message`, **then** Send stays disabled. **When** they replace it with "Steps: tapped Share twice", tap `report-bug-diagnostics` (now `selected: false`) and tap `report-bug-send`, **then** the sheet closes, `settings-screen` is visible, and `toast-message` reads "Thanks — your report was sent.". **And** `e2e-support.js` with `KIND=bug-report` finds the subject "Bug report from Notes 1.0.0 (1) \| e2e-person@gcnotes.test" and a body containing "Diagnostics: not included". **When** they reopen Report a bug, **then** `report-bug-message` is empty again. **When** they tap `report-bug-close`, **then** `settings-screen` is visible. | `apps/native/.maestro/phase-10/report-bug.yaml` |
| AC7 | **Given** `person` opens `settings-feedback`, **then** `feedback-sheet` shows `feedback-send` `enabled: false` and no `report-bug-diagnostics`. **When** they type "Love the search" and tap `feedback-send`, **then** `toast-message` reads "Thanks for your feedback.", and `e2e-support.js` with `KIND=feedback` finds the subject "Feedback on Notes 1.0.0 (1) \| e2e-person@gcnotes.test" and a body containing "Love the search". | `apps/native/.maestro/phase-10/send-feedback.yaml` |
| AC8 — **exit: sign out** | **Given** `person` in Settings, **when** they scroll to `settings-sign-out` and tap it, **then** `welcome-screen` is visible and `welcome-email` shows the placeholder "you@example.com". **When** the app is relaunched with the Keychain kept, **then** `welcome-screen` is visible and `home-screen` is not. | `apps/native/.maestro/phase-10/sign-out.yaml` |
| AC9 — **exit: delete account** | **Given** `person` on Profile, **when** they scroll to and tap `profile-delete`, **then** `delete-account-sheet` shows `delete-account-body` "You’ll lose 3 notes. This can’t be undone." and `delete-account-confirm` "Delete account". **When** they tap `delete-account-close`, **then** `profile-screen` is visible. **When** they reopen it and tap `delete-account-confirm`, **then** `welcome-screen` is visible. **When** the app is relaunched with the Keychain kept, **then** `welcome-screen` is still visible. **When** they sign in again as e2e-person@gcnotes.test (`sign-in.yaml`), **then** `onboarding-name-screen` is visible, because it is a new account with no profile. | `apps/native/.maestro/phase-10/delete-account.yaml` |
| AC10 | **Given** `person` on home, **when** they tap `home-get-desktop-button`, **then** `desktop-sheet` shows `desktop-hero`, `desktop-title` "Meeting notes on your computer", `desktop-body` "Take notes on video calls with Notes for Mac or Windows.", `desktop-share` "Share link", `desktop-remind` "Remind me later" and `desktop-done` "Done". **When** they tap `desktop-done`, **then** `home-screen` is unobstructed (`assert-home-unobstructed.yaml`). **When** they open Settings and tap `settings-desktop-banner`, **then** `desktop-sheet` is visible. **When** they tap `desktop-remind`, **then** the sheet closes, `toast-message` reads "We’ll email you a link to get Notes on your computer.", and `e2e-support.js` with `KIND=desktop-reminder` finds the subject "Get Notes for Mac or Windows". | `apps/native/.maestro/phase-10/get-desktop.yaml` |
| AC11 | **Given** `person` on home, **when** they tap `home-events-card`, **then** `work-email-sheet` shows `work-email-mark`, `work-email-title` "Much better with your work email", `work-email-body` "Sign up with the email you use for work to see your meetings in Notes.", `work-email-benefits`, `work-email-sign-up` "Sign up with work email" and `work-email-continue` "Continue anyway". **When** they tap `work-email-continue`, **then** `home-screen` is unobstructed and `home-events-card` is still visible. **When** they tap the card again and then `work-email-sign-up`, **then** `welcome-screen` is visible with `welcome-email` empty. | `apps/native/.maestro/phase-10/work-email.yaml` |
| AC12 | **Given** `person` in Settings, **when** they tap `settings-phone-calls`, **then** `phone-calls-title` reads "Make Calls From Notes" and `phone-calls-get-started` is visible. **When** they tap it, **then** `toast-message` reads "Phone calls are coming soon.". **When** they tap `phone-calls-back` and then `settings-watch`, **then** `watch-title` reads "Apple Watch", `watch-status` reads "No Apple Watch found", and `watch-info` reads "Pair an Apple Watch with this iPhone to use Notes from your wrist.". **When** they tap `watch-back`, **then** `settings-screen` is visible. | `apps/native/.maestro/phase-10/coming-soon-pages.yaml` |

**Flows from earlier phases that this phase changes:**

- `phase-2/home-shell-inert.yaml` stops tapping `home-get-desktop-button` and `home-events-card`,
  because they now open sheets. AC10 and AC11 own them, and the header comment says so.
  `home-phone-button` stays inert, and its tap stays in the flow.
- `phase-3/sign-out.yaml` gains a `scrollUntilVisible` on `settings-scroll` before it asserts
  `settings-sign-out` and `settings-version`, because both now sit below the fold. The rest of it
  is unchanged.
- The phase-3 onboarding flows are unchanged. `UserTypeMenu`'s default prefix stays
  `onboarding-user-type`.

The whole suite for phases 2–9 must still pass.

**Screenshots for the visual check** (TESTING.md §8). Each is compared by eye with its discovery
shot:

| Screenshot | From flow | Compare with |
| --- | --- | --- |
| `phase-10-settings-top` | AC1 | #80 |
| `phase-10-settings-bottom` | AC1 | #81 |
| `phase-10-profile-top` | AC2 | #82 (initial avatar, designed) |
| `phase-10-profile-bottom` | AC2 | #83 |
| `phase-10-user-type-menu` | AC2 | #84 |
| `phase-10-delete-sheet` | AC9 | designed (phase 9 `folder-delete-sheet`) |
| `phase-10-notifications` | AC4 | #85 |
| `phase-10-chat-settings` | AC5 | #86 |
| `phase-10-phone-calls` | AC12 | #87 |
| `phase-10-watch` | AC12 | #88 |
| `phase-10-report-bug` | AC6 | #90 |
| `phase-10-feedback` | AC7 | designed (#90) |
| `phase-10-get-desktop` | AC10 | #51 / #89 |
| `phase-10-work-email` | AC11 | #04 |

---

## 9. Designed states no flow reaches

These belong to the same scripted-failure harness seam that `BLOCKERS.md` defers for phases 3–9.

- **Toggle loading and retry** (`*-loading`, `*-retry`), and the "Couldn’t save this setting."
  revert. The local API answers too fast, or cannot be made to fail on demand. The revert is
  covered by a unit test of `toggleMutation`'s `onError` path in `features/settings/useSetting.ts`.
- **`profile-save-error`**, **`delete-account-error`** (both variants), **`report-bug-error`**,
  **`feedback-error`** and "Couldn’t set a reminder.". Each needs a request to fail.
  `EmailUnavailable` is covered by API test 15.
- **`delete-account-loading`**.
- **The zero-notes and one-note delete copy.** `deletionCopy(n)` is unit-tested with 0, 1 and 3.
  A flow as `empty` could reach 0, but one delete flow is enough on device.
- **Share link, Share Notes for iPhone, Help center, Learn more and Privacy policy.** They open
  system UI (the share sheet or `SFSafariViewController`), which has no testIDs and takes the
  app's hierarchy away. They are checked by hand once, and the handlers are one line each.
- **A known personal provider in the work-email body.** The seeded addresses are not Gmail.
  `personalEmailProvider` is unit-tested.
- **The no-user-type "Choose" value.** Every seeded, onboarded profile has a type, except
  `other` and `empty`. It is left to the unit test of `userTypeLabel`.

---

## 10. Blockers to record

- **The toggles control nothing yet.**
  - Upcoming meetings needs phase 11's calendar and a push channel, and push is out of scope.
  - Auto-send dictation needs dictation, which phase 7 left out.
  - Use my data has no training pipeline behind a fake LLM.

  All three are stored and read back, so the later phase only reads them. It does not have to
  migrate them.
- **No avatar photos.** #82 shows a photo, and the clone draws an initial. Uploading needs image
  storage, and an R2 bucket for avatars is a later decision.
- **Send feedback is an in-app form, not `mailto:`.** Discovery's hand-off to Mail cannot run on the
  simulator, and it would bypass the fake `Email` port. The form keeps the discovered subject line.
- **Support messages have no rate limit.** A signed-in caller can send as many as they like to the
  fake outbox. A live email client (the phase-3 blocker) should add one per user per hour before
  production.
- **Placeholder links.** `notes.example/*` does not resolve. The help, data and privacy content is
  not part of the app, and the URLs are one constant object to change.
- **"Remind me later" is an email, not a calendar or notification reminder.** Discovery never
  tapped it. The clone's only outbound channel is the fake email port.
- **"Sign up with work email" signs out.** Discovery never tapped it. Signing out is the only
  route in the clone to an account under another address. It asks no confirmation, which follows
  phase 3's sign-out rule.
- **Account deletion leaves the fake outbox rows and the R2 audio behind.** The audio half is the
  existing phase-5 blocker. The outbox exists only in the fake.
- **#04's grain texture is not reproduced.** It is a bitmap noise over `#252525`, recorded for
  the parity pass.

---

## 11. Task split

### API (packages/domain, packages/server, packages/db, apps/api, packages/apiclient)

1. **`packages/domain`:**
   - `Domain/Settings.ts`: `UserSettings`, `UserSettingsPatch` and `SETTINGS_DEFAULTS`;
   - `Domain/Support.ts`: `BugReportCreate`, `FeedbackCreate`, `SupportReceipt`,
     `SUPPORT_MESSAGE_MAX` and `SUPPORT_ADDRESS`;
   - `Domain/Profile.ts`: `DeletionPreview`;
   - `Domain/Support.test.ts` (test 16);
   - `Settings/Contract.ts` (`getSettingsRoute`, `patchSettingsRoute`, tag `Settings`);
   - `Support/Contract.ts` (`createBugReportRoute`, `createFeedbackRoute`,
     `createDesktopReminderRoute`, tag `Support`). The desktop route's path is `/me/desktop-reminder`;
   - `Profile/Contract.ts`: `getDeletionPreviewRoute` and `deleteMeRoute`.
2. **`packages/db`:**
   - `schema/user-settings.ts`, exported from `schema/index.ts`;
   - `bun run db:generate` → `d1-migrations/0009_user_settings.sql`;
   - `RESET_ORDER` gains `userSettings` before `profiles`.
3. **`packages/server/src/Settings/`:** `SettingsRepo` (`byUser`, `upsert`), `Policy.ts`,
   `SettingsService.ts` (`get`, `update`), `Http.ts`, `Settings.test.ts` (1–6) and
   `Settings.http.test.ts`.
4. **`packages/server/src/Profiles/`:**
   - `ProfilesRepo.deleteUser`, with the amended header comment;
   - `ProfilesService.deletionPreview` and `deleteAccount`, with the type-only
     `notes: Pick<NotesRepo, "countLive">` dependency;
   - `NotesRepo.countLive`;
   - two `Http.ts` lines;
   - tests 7–10, and the HTTP cases.
5. **`packages/server/src/Integrations/Email/`:** widen `EmailKind`, and extend `EmailFake` and
   `Email.test.ts` so the new kinds are recorded and written to the outbox with their payloads.
6. **`packages/server/src/Support/`:** `Policy.ts`, `SupportService.ts` (the renderers, which are
   pure and exported for tests), `Http.ts`, `Support.test.ts` (11–15) and `Support.http.test.ts`.
7. **`packages/server/src/E2E/`:** `E2eRepo.supportMessages(kind)`, the `E2eService` method,
   `GET /e2e/support` in `Http.ts`, and the `E2E.test.ts` case.
8. **`container.ts`:** wire `SettingsRepo`, `SettingsService` and `SupportService` under
   `traced()`, and give `ProfilesService` its `notes` dependency.
9. **`apps/api`:** mount the `Settings` and `Support` routers, add both OpenAPI tags, map any new
   error in `on-error.ts` (none is new: `ProfileNotFound` and `EmailUnavailable` exist), and extend
   `app.test.ts`.
10. **`packages/apiclient`:**
    - `settings.ts` and `support.ts`, exported from `index.ts`;
    - `profiles.ts`: `getDeletionPreview` and `deleteMe`;
    - `query-keys.ts`: `settings.*`, `profile.deletionPreview` and the invalidation keys;
    - key-shape tests in `client.test.ts`.
11. **Docs:** add the §7 scenario names to `docs/TESTING.md` §4, and the §10 blockers to
    `docs/plan/BLOCKERS.md`.

### Native (apps/native)

1. **Design:**
   - `tokens.ts` gains:
     - `switch.off: "#39393D"`;
     - `text.link: "#0A84FF"`;
     - `bg.preview: "#0F0F0F"`;
     - `olive.ring: "#515B1F"`;
     - `olive.glyph: "#8A9A2A"`;
     (`calendar.bar` `#DB35F2` already exists);
   - update `tokens.test.ts`;
   - `design/Toggle.tsx` (§3), with the `green` and `lime` track variants;
   - `design/SettingsCard.tsx` and `design/SettingsRow.tsx`, with the chevron, external, badge,
     toggle and no-accessory variants;
   - add all three to the dev gallery, keeping each gallery section under half a screen (the
     BLOCKERS note).
2. **`features/settings/`:**
   - `links.ts`;
   - `version.ts`, which moves `VERSION` out of the settings screen;
   - `copy.ts`, with every §4 string;
   - `profile.ts` (`profileFieldPatch`, `normaliseLinkedin`);
   - `workEmail.ts` (`personalEmailProvider`, `workEmailBody`);
   - `deletion.ts` (`deletionCopy`);
   - `useSetting.ts`: the optimistic toggle hook over `GET`/`PATCH /me/settings`;
   - `SupportForm.tsx`;
   - `settings.test.ts`, covering every pure helper.
3. **Routes:**
   - `app/settings/index.tsx` is rebuilt (§3.1). It keeps `settings-sign-out`,
     `settings-version` and `useSignOut`;
   - new: `app/settings/profile.tsx`, `delete-account.tsx`, `notifications.tsx`, `chat.tsx`,
     `phone-calls.tsx`, `watch.tsx`, `report-bug.tsx` and `feedback.tsx`, plus the top-level
     `app/desktop.tsx` and `app/work-email.tsx`;
   - their presentations are declared in `app/_layout.tsx`.
4. **Profile:**
   - the save-on-end-editing logic;
   - Back and `beforeRemove` flush;
   - the name through `authClient.updateUser`, with session and `me` refetched;
   - `UserTypeMenu` gains a `testIDPrefix` prop, defaulting to `onboarding-user-type`.
5. **Auth:** extract `signOutLocally` from `features/auth/signOut.ts` (§3.3), with no behaviour
   change for `signOut`.
6. **Home:**
   - `home-get-desktop-button` gets `onPress={() => router.push("/desktop")}`;
   - `home-events-card` gets `onPress={() => router.push("/work-email")}`;
   - the events card's comment about being inert is removed.
7. **`lib/api.ts`:** `settingsQuery`, `useUpdateSetting`, `deletionPreviewQuery`,
   `useDeleteAccount`, `useBugReport`, `useFeedback` and `useDesktopReminder`.
8. **Maestro:**
   - the twelve `phase-10/*.yaml` flows (§8);
   - `subflows/open-settings.yaml`, `subflows/open-settings-row.yaml` and
     `scripts/e2e-support.js`;
   - `config.yaml` gains `phase-10/*`;
   - the `phase-2/home-shell-inert.yaml` and `phase-3/sign-out.yaml` edits (§8).
