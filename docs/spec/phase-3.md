# Phase 3: Auth and onboarding

Status: spec. Source: `~/personal/granola-clone-discovery/` (`README.md` tokens, `COPY.md`,
`DATA-MODEL.md`, `NOT-EXERCISED.md`, `screens/04`, `80`, `81`, `82`, `83`, `84`). Screens are cited
as `#NN`. The product is **Notes**. Wherever discovery copy names the other product, this spec says
"Notes" instead, and no logo, asset or font from it is used.

**The discovery crawl never saw sign-in, sign-up or first-run onboarding.** The account was
already signed in (`NOT-EXERCISED.md`, "First-run onboarding, sign-in, paywall"). Every screen in
this phase except the profile form rows (#82–84) and the Sign out card (#81) is **our own design**.
It uses the visual language of #04, a centred serif headline over a grouped `bg.list` card with a
full-width light pill at the bottom and a grey text button under it, and of #82, a left-aligned
serif title over a grouped form card. Each section below says which one it borrows from.

## 1. Scope

In scope:

1. **Email sign-in and sign-up in one flow.** This is better-auth's email-OTP plugin, which is
   already configured in `@kn/auth`. An address that has no account gets one on its first verified
   code. There is no password and no separate "Create account" screen.
2. **A faked email provider.** OTP mail goes through an `Email` port (`PROVIDER-FAKES.md`). The fake
   writes each message to a dev-only outbox table, and the E2E harness reads the latest code from
   it. That is how a Maestro flow types a real code.
3. **The profile fields from #82–84**, stored and served: job title, company name, user type,
   company description, LinkedIn username, plus an onboarding-completed timestamp. `GET /me` gains
   them, `PATCH /me` edits them, and `POST /me/onboarding` completes onboarding.
4. **First-run onboarding** (our design), in three steps: name, about your work (a subset of the
   #82 form), and ready.
5. **Routing gates.** Signed out goes to welcome. Signed in but not onboarded goes to onboarding.
   Signed in and onboarded goes home. The gates also hold across relaunches.
6. **Sign out, reachable from home.** The `home-settings-button` avatar pushes a minimal Settings
   screen (#80/#81 chrome) that holds only the Sign out card and the version footer. This closes
   the phase-2 blocker "No sign-out in the app".
7. **Retiring the phase-2 dev entry.** `welcome-dev-home` and `app/dev/home.tsx` are deleted. The
   phase-2 flows are rewritten onto the real sign-in subflow. `welcome-dev-gallery` stays.

Out of scope, and owned by the phase named: the full Settings list and the Profile edit screen
(#80–83 beyond the Sign out card) (10); Delete Account (10); Google sign-in (not in the plan, and
`GOOGLE_*` stays empty); a live email provider (a later, key-dependent phase, see §9); the mic
primer (5).

## 2. Screens and routes

| Route | Screen | Public | Borrowed from |
| --- | --- | --- | --- |
| `app/screens/welcome.tsx` | Welcome: email step, then code step | yes | #04 (our design) |
| `app/onboarding/_layout.tsx` | Stack, no header, gesture back disabled on step 1 | no | — |
| `app/onboarding/name.tsx` | Step 1: your name | no | #04 (our design) |
| `app/onboarding/about.tsx` | Step 2: about your work | no | #82, #84 |
| `app/onboarding/ready.tsx` | Step 3: ready | no | #04 (our design) |
| `app/settings/index.tsx` | Settings (phase-3 subset) | no | #80, #81 |
| `app/index.tsx` | Home shell (phase 2), the avatar now navigates | no | #01 |

Every screen uses `bg.app` as its background, the tokens from phase 2 §2 only, `display` for
headlines and SF Pro for everything else. Controls are `PillButton`, `IconButton` and `Card` from
`src/design/`. There are no new primitives except `TextField` and `FormRow` (§2.7).

Shared onboarding layout: the safe area, then a 44pt top row holding a circular `IconButton` Back
(`ChevronLeft`, label "Back", 16 gutter) on steps 2 and 3, empty on step 1. On the right of the top
row sits the progress indicator: three 6pt dots with 6pt gaps, the current one `text.primary` and
the others `border.hairline`, testID `onboarding-progress` with accessibility label
"Step N of 3". Content has a 24 gutter. The primary pill (`tone=light`, `size=lg`) is pinned 12pt
above the keyboard or the bottom safe area (`KeyboardStickyView` from
react-native-keyboard-controller, already a dependency). A text button (`caption` 17pt,
`text.secondary`) sits 16pt below it, as "Continue anyway" does in #04.

### 2.1 Welcome, email step (our design, #04 language)

Layout, top to bottom, vertically centred in the space above the pinned pill:

1. **Headline** "Welcome to Notes", `display`, centred, `welcome-title`.
2. 16pt gap, **body** "Sign in or create an account with your email. We’ll send you a 6-digit
   code." (`body`, `text.secondary`, centred).
3. 32pt gap, **email field** `welcome-email`: `TextField`, full width, placeholder
   "you@example.com", `keyboardType=email-address`, `autoCapitalize=none`,
   `autoComplete=email`, `textContentType=emailAddress`, return key "next", which submits.
   (iOS has a "Continue" return key, but React Native's `returnKeyType` does not expose it.)
4. Pinned pill **"Continue"** `welcome-submit`. It is disabled until the trimmed value matches
   `^[^\s@]+@[^\s@]+\.[^\s@]+$`.
5. Development builds only: under the pill, the text button **"Component gallery"**
   `welcome-dev-gallery` (phase 2). "Preview home" is removed.

The field autofocuses on appear, so the keyboard is up in the steady state. That is why the pill is
keyboard-pinned.

### 2.2 Welcome, code step (our design)

The same screen with different state (no navigation), so a failed verify never loses the address.

1. **Headline** "Check your email", `display`, centred.
2. **Body** "We sent a 6-digit code to {email}." (`body`, `text.secondary`, centred). The address is
   `text.primary`. The testID `welcome-sent-to` is on the whole sentence (see §5).
3. **Code field** `welcome-otp`: `TextField`, 24pt SF Pro Medium, letter spacing 8, centred,
   `keyboardType=number-pad`, `textContentType=oneTimeCode` (iOS offers the code from Mail),
   `maxLength=6`. It autofocuses. Typing the sixth digit submits, with no tap needed. The pill still
   works, for the paste case.
4. Pinned pill **"Verify"** `welcome-submit`, disabled until 6 digits.
5. Two text buttons in a row, centred, 24pt apart:
   - **"Resend code"** `welcome-resend`. For 30s after each send it is disabled and reads
     "Resend in 0:30", counting down. Resending replaces the code, so the old one stops working
     (better-auth behaviour).
   - **"Use a different email"** `welcome-change-email`. It returns to the email step with the
     field still filled and the code cleared.

### 2.3 Onboarding step 1: name (our design)

Root `onboarding-name-screen`. Left-aligned like #82:

1. **Headline** "What should we call you?" (`display`, left).
2. 12pt gap, **body** "Notes uses your first name when it greets you." (`body`, `text.secondary`).
3. 32pt gap, **field** `onboarding-name-input`, placeholder "Your name",
   `textContentType=name`, `autoCapitalize=words`, prefilled with `session.user.name`. That is
   empty after an OTP sign-up, but a user who quit mid-onboarding and relaunched sees what they
   saved.
4. Pinned pill **"Continue"** `onboarding-name-continue`, disabled while the trimmed name is
   empty. It is limited to 80 characters (`maxLength`).
5. Text button **"Not you? Sign out"** `onboarding-sign-out`. It signs out (same path as §2.6) and
   lands on welcome. This is the way out for somebody who typed the wrong address, because step 1
   has no Back.

Continue calls better-auth's `authClient.updateUser({ name })`. The name lives on better-auth's
`user` row and `ProfilesRepo` never writes that row (see the comment in `ProfilesRepo.ts`). The
update refreshes the session, which is what gives the avatar its initial. On success it pushes
`onboarding/about`.

### 2.4 Onboarding step 2: about your work (#82 form, #84 menu)

Root `onboarding-about-screen`. Back returns to step 1.

1. **Headline** "Tell us about your work" (`display`, left).
2. **Body** "Notes works best when it knows a little about you. Make sure this is correct to get
   the most out of Notes." (from #82, product name replaced).
3. 24pt gap, one **grouped form card** as in #82: `bg.app` fill, 1px `border.hairline`, radius 28,
   16 inner padding. It holds three `FormRow`s separated by hairlines that inset 16 from the left
   and run to the right edge (#82). Each row is at least 56pt tall, label on the left (`body`,
   `text.primary`) and value right-aligned (`body`; placeholder `text.tertiary`):
   - **Job Title**, `onboarding-job-title`, placeholder "Your job title".
   - **Company Name**, `onboarding-company`, placeholder "Your company". The label wraps to two
     lines on a narrow width, as in #82.
   - **User Type**, `onboarding-user-type`, a pressable showing the chosen label followed by a
     `ChevronsUpDown` glyph (#82's "⌃⌄"), or "Choose" in `text.tertiary` when nothing is chosen.
4. Pinned pill **"Continue"** `onboarding-about-continue`, always enabled. It sends `PATCH /me`
   with whatever is filled. Empty fields are sent as `null`. Then it pushes `onboarding/ready`.
5. Text button **"Skip for now"** `onboarding-about-skip`. It pushes `onboarding/ready` without
   saving.

Company Description and LinkedIn Username (#83) are stored and served by the API this phase but
are **not** asked for in onboarding. Two long fields would make the first run a form. Phase 10's
Profile screen edits all six.

**User type menu (#84).** Tapping the row opens a popover, 248pt wide, right-aligned with the
row's value and with its top 16pt *into* the row it opened from, so it overlaps the User Type row
as #84's does. It has `bg.sheet` fill, radius 24 (measured off #84; an earlier draft of this spec
said 14, which the shot does not support), a 1px `border.hairline` edge, 44pt rows and SF Pro `body`, with a
leading `Check` glyph on the selected row and 28pt left padding on the others (#84). The options,
in order, are **Investing, Recruiting, Customer Facing, Startup/Generalist, Other**, with testIDs
`onboarding-user-type-option-<value>` (`investing`, `recruiting`, `customer_facing`,
`startup_generalist`, `other`). The popover root is `onboarding-user-type-menu`. Tapping outside
dismisses it with no change, as #84 does. **This is drawn by us rather than as a native `UIMenu`**,
because native menu items carry no testID and Maestro selects by id only. That departure is
deliberate. It looks the same as #84 at rest.

### 2.5 Onboarding step 3: ready (our design, #04 language)

Root `onboarding-ready-screen`. Back returns to step 2. Centred like #04:

1. **Headline** "You’re all set, {firstName}" (`display`, centred), `onboarding-ready-title`.
   `firstName` is the first whitespace-separated word of the name. Without a name it reads
   "You’re all set".
2. 24pt gap, a **grouped card** as in #04: `bg.list`, radius 24, hairline, and two rows 72pt tall
   separated by a full-width hairline. Each row has a 44pt round icon tile (`bg.app` fill, hairline)
   and `body` text:
   - `Plus`: "Tap + to record and transcribe a meeting"
   - `MessageCircle`: "Ask anything about your notes"
3. Pinned pill **"Start taking notes"** `onboarding-ready-finish`. It sends `POST /me/onboarding`,
   invalidates the `me` query, and `router.replace("/")`.

### 2.6 Settings, phase-3 subset (#80, #81)

Pushed from home by `home-settings-button`. Root `settings-screen`.

- Top row: circular `IconButton` Back `settings-back` (`ChevronLeft`, label "Back"), 16 gutter,
  and the centred title **"Settings"** (`title`, 20pt semibold), as in #80.
- 24pt below, a card (`bg.app`, 1px `border.hairline`, radius 28, 20 gutter) holding one 64pt row:
  a 44pt `bg.tileRaised` rounded tile (radius 12) with a `LogOut` glyph, then **"Sign out"**
  (`body`). The whole row is the button `settings-sign-out` (#81, discovery id
  `settingsSignOutButton`).
- 16pt below, a centred footer in `caption` (`text.tertiary`):
  `{expo version} ({build number})`, e.g. "1.0.0 (1)", testID `settings-version`. Both come from
  `app.json` through `expo-constants` (`version` and `ios.buildNumber`); prebuild writes the
  latter into the binary's `CFBundleVersion`, so they agree without adding `expo-application` as
  a native dependency.

Phase 10 inserts the Account, Features, Support and Data & sharing sections above the Sign out
card. This phase ships only the bottom of #81.

**Sign out** runs `authClient.signOut()`. It then clears the React Query cache
(`queryClient.clear()`), so the next account never paints the previous account's profile, and
`router.replace("/screens/welcome")`. There is **no confirmation dialog**. Discovery never pressed
Sign out, and an iOS alert has no testID. If the server call fails (offline), the local credential
is still deleted from SecureStore. The server session then expires on its own (30 days). A signed-in
phone that cannot sign out is worse than a dangling server row.

### 2.7 New primitives

- `TextField`: height 56, `bg.list`, 1px `border.hairline`, radius 28 (a pill, matching the search
  field in #60), 20 horizontal padding, `body` text, `text.tertiary` placeholder, cursor and
  selection `accent.lime`, `keyboardAppearance="dark"`. A focused field's border is `text.secondary`.
  Props: the `TextInput` props plus `testID` (required).
- `FormRow`: label plus a right-aligned inline `TextInput` (no border, no fill) or pressable value.
  It is used inside a grouped card. Props: `label`, `testID`, and either `value`/`onChangeText`/
  `placeholder`, or `valueLabel`/`onPress`.

Both go into the phase-2 gallery under Surfaces (`gallery-text-field`, `gallery-form-row`).

## 3. States

| Screen | State | What shows | Seen in discovery? |
| --- | --- | --- | --- |
| App boot | Loading | The native splash is held until the session resolves **and**, when there is a session, until `GET /me` resolves. Only then can the gate choose between home and onboarding without flashing the wrong one. | No |
| App boot | Error | `GET /me` fails for a signed-in user (network, 5xx). Screen `boot-error-screen`: centred `display` "Couldn’t reach Notes", body "Check your connection and try again.", light pill "Try again" `boot-error-retry` (refetch), and text button "Sign out" `boot-error-sign-out`. `ProfileNotFound` (404, the account was deleted) is not shown: it signs out silently and lands on welcome. | No |
| Welcome email | Empty | Field empty, Continue disabled | No |
| Welcome email | Populated | Valid address, Continue enabled | No |
| Welcome email | Loading | Continue shows a small `ActivityIndicator` (`text.onLight`) in place of its label and stays `welcome-submit`. The field is not editable. | No |
| Welcome email | Error | A `caption` line in `destructive`, 12pt under the field, `welcome-error` (copy in §4). The field stays editable. | No |
| Welcome code | Empty / populated / loading | As above for the code field and Verify | No |
| Welcome code | Error | `welcome-error` under the code field. The code field is cleared and refocused. | No |
| Onboarding 1 | Empty | Name empty (fresh sign-up), Continue disabled | No |
| Onboarding 1 | Populated | Prefilled or typed name | No |
| Onboarding 1 | Loading / error | Pill spinner. On failure `onboarding-name-error` "Couldn’t save your name. Try again." | No |
| Onboarding 2 | Empty | Placeholders "Your job title", "Your company", "Choose" | #82 (empty job title and company as seen) |
| Onboarding 2 | Populated | Typed values, the chosen user type label | #82 |
| Onboarding 2 | Menu open | §2.4 popover | #84 |
| Onboarding 2 | Loading / error | Pill spinner. `onboarding-about-error` "Couldn’t save your details. Try again, or skip for now." A 422 is not expected, because the client enforces the same limits. | No |
| Onboarding 3 | Populated | §2.5 | No |
| Onboarding 3 | Loading / error | Pill spinner. `onboarding-ready-error` "Something went wrong. Try again." | No |
| Settings | Populated | §2.6 | #81 (bottom) |
| Settings | Loading | While sign-out is in flight the row shows an `ActivityIndicator` in place of the chevron-less trailing edge and ignores taps | No |
| Home | Populated | The phase-2 shell. The avatar initial now comes from a real session. | #01 |

There is no empty or error state for Settings itself. It reads nothing.

## 4. Copy

Discovery copy is verbatim from `COPY.md`, with the product name replaced. Everything marked
*(ours)* was designed here, because discovery never saw these screens.

| Where | Copy |
| --- | --- |
| Welcome headline *(ours)* | Welcome to Notes |
| Welcome body *(ours)* | Sign in or create an account with your email. We’ll send you a 6-digit code. |
| Email placeholder *(ours)* | you@example.com |
| Email pill *(ours)* | Continue |
| Code headline *(ours)* | Check your email |
| Code body *(ours)* | We sent a 6-digit code to {email}. |
| Code pill *(ours)* | Verify |
| Resend *(ours)* | Resend code · Resend in 0:{ss} |
| Change email *(ours)* | Use a different email |
| Error: invalid code *(ours)* | That code didn’t work. Check it and try again. |
| Error: expired code *(ours)* | That code has expired. Send a new one. |
| Error: too many attempts *(ours)* | Too many attempts. Send a new code. |
| Error: rate limited, 429 *(ours)* | Too many tries. Wait a minute and try again. |
| Error: invalid email from the server *(ours)* | Enter a valid email address. |
| Error: network *(ours)* | Couldn’t reach Notes. Check your connection and try again. |
| Error: anything else *(ours)* | Something went wrong. Try again. |
| Onboarding 1 *(ours)* | What should we call you? · Notes uses your first name when it greets you. · Your name · Continue · Not you? Sign out |
| Onboarding 1 error *(ours)* | Couldn’t save your name. Try again. |
| Onboarding 2 headline *(ours)* | Tell us about your work |
| Onboarding 2 body (#82) | Notes works best when it knows a little about you. Make sure this is correct to get the most out of Notes. |
| Onboarding 2 rows (#82) | Job Title · Your job title · Company Name · Your company · User Type |
| User type placeholder *(ours)* | Choose |
| User types (#84) | Investing · Recruiting · Customer Facing · Startup/Generalist · Other |
| Onboarding 2 buttons *(ours)* | Continue · Skip for now |
| Onboarding 2 error *(ours)* | Couldn’t save your details. Try again, or skip for now. |
| Onboarding 3 *(ours)* | You’re all set, {firstName} · You’re all set · Tap + to record and transcribe a meeting · Ask anything about your notes · Start taking notes |
| Onboarding 3 error *(ours)* | Something went wrong. Try again. |
| Progress a11y *(ours)* | Step 1 of 3 · Step 2 of 3 · Step 3 of 3 |
| Settings (#80, #81) | Settings · Sign out |
| A11y: back buttons (#10) | Back |
| Boot error *(ours)* | Couldn’t reach Notes · Check your connection and try again. · Try again · Sign out |
| OTP email subject *(ours)* | Your Notes sign-in code |
| OTP email body *(ours)* | Your Notes code is {otp}. It expires in 5 minutes. If you didn’t ask for it, you can ignore this email. |

Error mapping: `authClient` errors are mapped on `error.code` (better-auth's `INVALID_OTP`,
`OTP_EXPIRED`, `TOO_MANY_ATTEMPTS`, `INVALID_EMAIL`) and on `error.status === 429`, never on
`error.message`, in one pure function `welcomeErrorCopy(error)` in
`src/features/auth/errors.ts`. A fetch failure with no status is "network".

## 5. testIDs

| testID | Element | Discovery id |
| --- | --- | --- |
| `welcome-screen` | Welcome root (unchanged) | |
| `welcome-title` | Headline | |
| `welcome-body` | Email-step body line | |
| `welcome-email` | Email field (unchanged) | |
| `welcome-otp` | Code field (unchanged) | |
| `welcome-submit` | Continue / Verify pill (unchanged) | |
| `welcome-sent-to` | The whole code-step body sentence, not the address alone: iOS flattens nested `<Text>` into one accessibility element, so an id on the inner address never reaches Maestro. Flows match the address inside it with a regex. | |
| `welcome-resend` | Resend code | |
| `welcome-change-email` | Use a different email | |
| `welcome-error` | Inline error line | |
| `welcome-dev-gallery` | Dev-only gallery link (unchanged) | |
| `onboarding-progress` | Step dots | |
| `onboarding-back` | Back on steps 2 and 3 | `Back` |
| `onboarding-name-screen`, `onboarding-name-title`, `onboarding-name-input`, `onboarding-name-continue`, `onboarding-name-error`, `onboarding-sign-out` | Step 1 | |
| `onboarding-about-screen`, `onboarding-about-title`, `onboarding-job-title`, `onboarding-company`, `onboarding-user-type`, `onboarding-user-type-menu`, `onboarding-user-type-option-<value>`, `onboarding-about-continue`, `onboarding-about-skip`, `onboarding-about-error` | Step 2 | (#84 menu had none) |
| `onboarding-ready-screen`, `onboarding-ready-title`, `onboarding-ready-finish`, `onboarding-ready-error` | Step 3 | |
| `settings-screen`, `settings-back`, `settings-sign-out`, `settings-version` | Settings | `settingsSignOutButton` |
| `boot-error-screen`, `boot-error-retry`, `boot-error-sign-out` | Boot error | |
| `home-screen`, `home-settings-button`, `home-avatar-initial` | Home (phase 2, unchanged) | `homeSettingsButton` |
| `gallery-text-field`, `gallery-form-row` | Gallery additions | |

## 6. API

### 6.1 Data

New table **`profiles`** (`packages/db/src/schema/profiles.ts`). It is separate from better-auth's
generated `user`, which is never hand-edited and never written by our repositories. Keys are
alphabetical and timestamps are integer epoch milliseconds (AGENTS.md):

| Column | Type | Notes |
| --- | --- | --- |
| `companyDescription` | text, null | ≤ 1000 |
| `companyName` | text, null | ≤ 100 |
| `createdAt` | integer, not null | |
| `jobTitle` | text, null | ≤ 100 |
| `linkedinUsername` | text, null | `^[A-Za-z0-9-]{3,100}$` |
| `onboardedAt` | integer, null | set once, never cleared |
| `updatedAt` | integer, not null | |
| `userId` | text, PK, FK `user.id` `on delete cascade` | |
| `userType` | text, null | enum below |

**A missing row means "all null, not onboarded".** `GET /me` never inserts one. The first
`PATCH /me` or `POST /me/onboarding` upserts it. This is the same reasoning as hono-port's
notification-settings defaults: a read that writes is a write on the hottest endpoint.

New table **`email_outbox`** (`packages/db/src/schema/email-outbox.ts`). Only the fake email
provider writes it:

| Column | Type |
| --- | --- |
| `body` | text, not null |
| `createdAt` | integer, not null |
| `id` | text, PK (`eml_…`) |
| `kind` | text, not null (`otp`) |
| `payload` | text, not null (JSON `{ otp, type }`) |
| `recipient` | text, not null, indexed with `createdAt` |
| `subject` | text, not null |

Both tables join `RESET_ORDER` (neither has children, so their position only has to precede nothing). One
migration: `bun run db:generate`.

### 6.2 Domain (`packages/domain`)

```ts
// Domain/Profile.ts
export const UserType = z.enum(["investing", "recruiting", "customer_facing", "startup_generalist", "other"]);
export const Profile = z.object({
  companyDescription: z.string().nullable(),
  companyName: z.string().nullable(),
  createdAt: Timestamp,
  email: z.string().min(1),
  emailVerified: z.boolean(),
  id: UserId,
  jobTitle: z.string().nullable(),
  linkedinUsername: z.string().nullable(),
  name: z.string(),
  onboardedAt: Timestamp.nullable(),
  userType: UserType.nullable(),
});
// A trimmed optional string: "" and whitespace become null, so a cleared field clears.
export const ProfilePatch = z.strictObject({
  companyDescription: OptionalText(1000),
  companyName: OptionalText(100),
  jobTitle: OptionalText(100),
  linkedinUsername: OptionalPattern(/^[A-Za-z0-9-]{3,100}$/), // "" → null before the regex runs
  userType: UserType.nullable().optional(),
});
```

`name` and `email` are **not** in `ProfilePatch`. The name is written through better-auth's
`POST /api/auth/update-user` (§2.3), and changing the email is out of scope. `z.strictObject` makes
an unknown key a 422, so a client sending `name` learns it went nowhere.

### 6.3 Routes (`packages/domain/src/Profile/Contract.ts`)

| Route | Name | Body | 200 | Errors |
| --- | --- | --- | --- | --- |
| `GET /me` | `getMeRoute` (exists) | — | `Profile` (extended) | 401, 404 `ProfileNotFound` |
| `PATCH /me` | `patchMeRoute` | `ProfilePatch` | `Profile` | 401, 404, 422 |
| `POST /me/onboarding` | `completeOnboardingRoute` | none | `Profile` | 401, 404 |

- `PATCH` changes only the keys present. An absent key is untouched and `null` clears. `{}` is a
  valid no-op that returns the profile.
- `POST /me/onboarding` is **idempotent**. The first call sets `onboardedAt = clock.now()`, and
  later calls return the profile with the original timestamp. The repo does
  `insert … on conflict(userId) do update set onboardedAt = coalesce(onboardedAt, excluded.onboardedAt)`,
  so two concurrent calls cannot both win.
- `ProfilesService` gains `update(actor, patch)` and `completeOnboarding(actor)`. Both go through
  a `canEditProfile` policy (own row only, `Authorized<A>`). Both throw `ProfileNotFound` when the
  actor's `user` row is gone, which the FK would otherwise surface as a 500.
- `ProfilesRepo.byId` left-joins `profiles`. New `upsertDetails(userId, patch, now)` and
  `markOnboarded(userId, now)`.

### 6.4 Auth routes used (better-auth, unchanged, under `/api/auth`)

| Call | Client | Purpose |
| --- | --- | --- |
| `POST /email-otp/send-verification-otp` `{ email, type: "sign-in" }` | `authClient.emailOtp.sendVerificationOtp` | Send (and resend) a code |
| `POST /sign-in/email-otp` `{ email, otp }` | `authClient.signIn.emailOtp` | Verify. Creates the user on first use (sign-up). |
| `POST /update-user` `{ name }` | `authClient.updateUser` | Onboarding step 1 |
| `POST /sign-out` | `authClient.signOut` | Sign out |
| `GET /get-session` | `authClient.useSession` | Boot and relaunch |

OTP settings: the length is 6, the expiry is the default 300s, and `allowedAttempts` is the default
3. They are stated explicitly in `createAuth` so the copy in §4 cannot drift from them.

### 6.5 Email port (`packages/server/src/Integrations/Email/`)

Per `PROVIDER-FAKES.md`: `Port.ts` (`send(message: { to, subject, body, kind, payload })`),
`EmailFake.ts` (deterministic, records `calls`, can be scripted to raise `EmailUnavailable`,
503), `Email.test.ts`. The fake takes an injected `sink`. `container.ts` gives it the
`OutboxRepo` (`packages/server/src/Outbox/OutboxRepo.ts`), and unit tests give it an array.
**No live client is written in this phase** (§9).

- `EMAIL_MODE` (`fake | live`) is parsed in `Runtime/AppConfig.ts`, default `fake`. `parseConfig`
  **refuses** `EMAIL_MODE=fake` with `NODE_ENV=production`, because the fake writes a plaintext code
  to D1. It also refuses `live`, naming the missing client, until one exists. Both are startup
  failures, as `E2E_HARNESS` is.
- `AuthEmails` service (`packages/server/src/AuthEmails/AuthEmailsService.ts`,
  `makeAuthEmailsService({ email })`) renders the §4 subject and body and calls the port.
  `apps/api/src/middleware.ts`'s `otpEmail` delegates `sendOtpEmail` to
  `buildContainer(env).authEmails.sendOtp`. The `auth.otp.issued` log line keeps its event slug
  and **drops the `otp` field everywhere**, dev included, because the outbox is now where a
  developer reads it.
- Local `wrangler.jsonc` `vars` gain `"EMAIL_MODE": "fake"`, and so does the deployed dev `env`
  block (the E2E gate). Production's block says nothing yet and so fails at startup if deployed.
  That is recorded in BLOCKERS, and it matches today, where email sign-in already does not work in
  production.

### 6.6 E2E harness additions (`packages/server/src/E2E/`, plain Hono, not in OpenAPI)

- `GET /e2e/otp?email=<address>` returns the newest outbox `otp` row for that recipient:
  `{ email, otp, type, sentAt }`. It answers 404 `{ _tag: "NoOutboxMail" }` when there is none — its own tag, so it cannot be mistaken for the router's `NotFound`. It sits
  behind the same guard as the others (404 when disarmed, 401 on a bad secret).
- `E2E_USERS` gains `newcomer: { email: "e2e-newcomer@kothanote.test" }`, which is **never seeded**.
  `POST /e2e/reset` additionally deletes the `user` row with that email (cascading to its
  sessions, accounts and profile), and deletes the `verification` rows better-auth keys to it (`${type}-otp-${email}`, matched exactly, so an address that merely contains it keeps its codes).
  The sign-up flow therefore always meets an unknown address.
- `POST /e2e/seed` upserts `profiles` rows for `person` and `other` with `onboardedAt` set to the
  seed time, so a seeded sign-in goes straight home. `person` also gets `jobTitle: "Engineer"`,
  `companyName: "Notes E2E"`, `userType: "startup_generalist"`.

### 6.7 Rate limit

`authRateLimit` (20/min per `cf-connecting-ip`, and `"anonymous"` locally, where every simulator
request shares one key) would trip during a Maestro run, because each flow launches, fetches the
session, sends a code and verifies. `AUTH_RATE_LIMIT` becomes a var, default 20. Local `vars` set
`"AUTH_RATE_LIMIT": "600"`. Deployed blocks keep the default. The limit is read where
`authRateLimit` is built, alongside the `NODE_ENV` read that is already there.

### 6.8 API client (`packages/apiclient`)

`makeProfilesApi` gains `updateMe: endpoint<typeof patchMeRoute>("patch", "/me")` and
`completeOnboarding: endpoint<typeof completeOnboardingRoute>("post", "/me/onboarding")`, with
query keys `profiles.me`. The native app reads `GET /me` through React Query (`meQuery`, re-added
to `lib/api.ts`).

## 7. API-level test cases

`packages/server/src/Profiles/Profiles.test.ts` (service, real repo over `makeTestD1()`,
`fixedClock`, `sequentialIds`):

1. `me` for a user with no `profiles` row returns every detail as `null` and `onboardedAt: null`,
   and inserts no row.
2. `update` sets `jobTitle`, `companyName` and `userType`, and returns them. A second `me` reads
   them back.
3. `update` with only `companyName` leaves `jobTitle` and `userType` untouched.
4. `update` with `jobTitle: null` clears it. The contract turns `"  "` into `null` (domain test).
5. `update({})` is a no-op that returns the profile unchanged.
6. `completeOnboarding` sets `onboardedAt` to the clock's now. After advancing the clock, a second
   call returns the **first** timestamp.
7. `update` and `completeOnboarding` for an actor whose `user` row was deleted throw
   `ProfileNotFound`.
8. Actor A's `update` leaves actor B's row byte-identical (ownership: the service takes the id
   from the actor, never from input).
9. Deleting a `user` row cascades its `profiles` row (schema).

`packages/server/src/Profiles/Profiles.http.test.ts` (wire shape):

10. `GET /me` anonymous → 401 `Unauthorized`. Signed in → 200, parses as the extended `Profile`.
11. `PATCH /me` `{ userType: "astronaut" }` → 422 `ValidationFailed`.
12. `PATCH /me` `{ name: "x" }` → 422 (strict object).
13. `PATCH /me` `{ linkedinUsername: "a b" }` → 422. `{ companyName: "x".repeat(101) }` → 422.
14. `PATCH /me` valid → 200 with the patched fields. `POST /me/onboarding` → 200 with
    `onboardedAt` a number.
15. `PATCH /me` and `POST /me/onboarding` anonymous → 401.

`packages/domain/src/Domain/Profile.test.ts`: `ProfilePatch` trims, turns `""` into `null`,
accepts every `UserType`, and rejects an unknown key.

`packages/server/src/Integrations/Email/Email.test.ts`:

16. The fake records each call and writes one row to its sink per send.
17. Scripted `unavailable` throws `EmailUnavailable` (503) and writes nothing.

`packages/server/src/AuthEmails/AuthEmails.test.ts`:

18. `sendOtp({ email, otp, type })` sends the §4 subject and a body that contains the code, with
    `kind: "otp"` and `payload.otp`.

`packages/server/src/Runtime/AppConfig.test.ts` (new or extended):

19. `EMAIL_MODE=fake` with `NODE_ENV=production` fails, naming `EMAIL_MODE`.
    `EMAIL_MODE=live` fails, naming the missing client. Absent → `fake`.

`apps/api/src/e2e-harness.test.ts` (real app):

20. `GET /e2e/otp` answers 404 when disarmed, and 401 with a wrong secret when armed.
21. After `POST /api/auth/email-otp/send-verification-otp` for the newcomer, `GET /e2e/otp` returns
    a 6-digit code, and `POST /api/auth/sign-in/email-otp` with it returns a session (the full
    sign-up round trip in-process). A second send makes `GET /e2e/otp` return the new code.
22. `POST /e2e/reset` after that sign-up deletes the newcomer's `user`, `session` and `profiles`
    rows and the outbox, and leaves `person` and `other` and their sessions intact.
23. `POST /e2e/seed` leaves `person` with `onboardedAt` set.
24. The `auth.otp.issued` log line never contains the code (captured logger).

`apps/api/src/app.test.ts`: 25. with `AUTH_RATE_LIMIT=2`, the third `/api/auth/*` request in a
window is 429 `RateLimited`.

`packages/apiclient/src/client.test.ts`: 26. `updateMe` sends `PATCH /me` with a JSON body and
decodes the response. `completeOnboarding` sends `POST /me/onboarding` with no body.

`packages/e2e/src/Journeys/Onboarding.ts` (deployed dev gate): 27. as `person`,
`PATCH /me { jobTitle }`, then `GET /me` reflects it. `POST /me/onboarding` twice returns the same
`onboardedAt`. As `other`, `GET /me` does not show `person`'s job title.

Native unit tests (vitest, `apps/native`):

28. `src/features/auth/gate.test.ts`: the pure `gateFor({ session, profile, segments })` returns
    `welcome` when signed out on a private route, `onboarding` when signed in with
    `onboardedAt: null` on any non-onboarding route, `home` when onboarded on welcome or
    onboarding, and `stay` otherwise.
29. `src/features/auth/errors.test.ts`: `welcomeErrorCopy` maps each code and 429 to its §4 line,
    and anything unknown to "Something went wrong. Try again."
30. `firstNameOf("Rita Newcomer") === "Rita"`, `firstNameOf("  ") === null`.

## 8. Acceptance criteria

Every flow lives in `apps/native/.maestro/phase-3/`, is tagged `phase-3` (plus `regression`),
selects by `id` only, waits with `extendedWaitUntil` (never `sleep`), and starts from
`subflows/launch-app.yaml` (`clearState` + `clearKeychain`) followed by `subflows/e2e-reset.yaml`.
`config.yaml` adds `phase-3/*`.

New subflows and scripts:

- `subflows/e2e-reset.yaml` runs `scripts/e2e-reset.js` (Maestro `runScript`, `http.post`) against
  `${API_URL}/e2e/reset` then `/e2e/seed`, with header `x-e2e-secret: ${E2E_SECRET}`. It fails the
  flow when either is not 200.
- `subflows/sign-in.yaml`, parameter `EMAIL`: waits for `welcome-screen`, types `EMAIL` into
  `welcome-email`, taps `welcome-submit`, waits for `welcome-otp`, runs `scripts/read-otp.js`
  (`GET /e2e/otp?email=…` → `output.otp`) and types `${output.otp}` into `welcome-otp`, where the
  sixth digit submits.
- `subflows/relaunch-app.yaml`: `stopApp`, then `launchApp` with the same dev-client arguments as
  `launch-app.yaml` but **without** `clearState`/`clearKeychain`.
- `scripts/maestro.sh` passes `-e API_URL` (default `http://localhost:3001`, overridable for the
  :3002 workaround in BLOCKERS) and `-e E2E_SECRET` from `apps/api/.dev.vars`.

**AC1. Sign up: a new address goes through onboarding to home.** `phase-3/sign-up.yaml`
- Given a clean launch and a reset backend
- When the user signs in with `e2e-newcomer@kothanote.test` and the code from the outbox
- Then `onboarding-name-screen` is visible, `onboarding-name-input` is empty and
  `onboarding-name-continue` is disabled
- When they type "Rita Newcomer" and tap `onboarding-name-continue`
- Then `onboarding-about-screen` is visible
- When they type "Designer" into `onboarding-job-title` and "Acme" into `onboarding-company`, tap
  `onboarding-user-type`, see `onboarding-user-type-menu`, tap
  `onboarding-user-type-option-investing`
- Then `onboarding-user-type` shows "Investing" and the menu is gone
- When they tap `onboarding-about-continue`
- Then `onboarding-ready-title` reads "You’re all set, Rita"
- When they tap `onboarding-ready-finish`
- Then `home-screen` is visible and `home-avatar-initial` reads "R".
- Screenshots `phase-3-onboarding-name`, `phase-3-onboarding-about`, `phase-3-onboarding-menu`
  and `phase-3-onboarding-ready` are taken for the visual check against #82 and #84.

**AC2. Sign in: a seeded, onboarded user goes straight home.** `phase-3/sign-in.yaml`
- Given a clean launch and a seeded backend
- When the user signs in with `e2e-person@kothanote.test`
- Then `home-screen` is visible without any `onboarding-*` screen appearing, and
  `home-avatar-initial` reads "E". Maestro samples the screen, so "without appearing" is checked
  twice — straight after the sixth digit, while the session and profile resolve, and again once
  home is up. That catches a gate that routes to onboarding; it cannot rule out a flash shorter
  than one sample, which is the splash hold's job (§3) and is checked by eye in the screenshots.
- And the copy is pinned: `welcome-title` reads "Welcome to Notes" then "Check your email",
  `welcome-body`, `welcome-sent-to`, both pill labels, and the Resend and "Use a different email"
  labels match §4.
- And the email step showed `welcome-title`, and the code step showed `welcome-sent-to` with the
  address (screenshots `phase-3-welcome-email`, `phase-3-welcome-code`).

**AC3. Sign out from home.** `phase-3/sign-out.yaml`
- Given `e2e-person` signed in via `subflows/sign-in.yaml` and `home-screen` visible
- When they tap `home-settings-button`
- Then `settings-screen`, `settings-sign-out` and `settings-version` are visible
  (screenshot `phase-3-settings`)
- When they tap `settings-sign-out`
- Then `welcome-screen` is visible and `welcome-email` is empty (its reported text is exactly the
  placeholder "you@example.com", and `welcome-submit` is disabled)
- When the app is relaunched with `subflows/relaunch-app.yaml` (Keychain **not** cleared)
- Then `welcome-screen` is visible, not `home-screen`, which proves sign-out deleted the stored
  credential rather than hiding it.
- And `settings-back` on a second visit (before sign-out) returns to `home-screen`. This is covered
  in the same flow, first.

**AC4. A relaunch stays signed in.** `phase-3/relaunch-signed-in.yaml`
- Given `e2e-person` signed in and `home-screen` visible
- When the app is relaunched with `subflows/relaunch-app.yaml`
- Then `home-screen` is visible and `welcome-screen` never appears
  (`assertNotVisible: welcome-screen` sampled once during the boot and again after `home-screen`
  is up — the same sampling limit as AC2).

**AC5. Onboarding survives a relaunch and can be skipped.** `phase-3/onboarding-resume.yaml`
- Given a newcomer who completed step 1 with "Rita Newcomer" and is on `onboarding-about-screen`
- When the app is relaunched
- Then `onboarding-name-screen` is visible with `onboarding-name-input` reading "Rita Newcomer"
  (not home: `onboardedAt` is still null)
- When they continue, tap `onboarding-about-skip`, and tap `onboarding-ready-finish`
- Then `home-screen` is visible
- When the app is relaunched again
- Then `home-screen` is visible (onboarding is not shown twice).

**AC6. A wrong code is refused and recoverable.** `phase-3/sign-in-wrong-code.yaml`
- Given the code step for `e2e-person@kothanote.test`
- When the user types `000000` (the flow first asserts that the outbox code is not `000000`,
  re-sending if it is)
- Then `welcome-error` reads "That code didn’t work. Check it and try again.", `welcome-otp` is
  empty (`welcome-submit` is disabled) and `welcome-screen` is still showing
- When they tap `welcome-change-email`
- Then `welcome-email` still holds the address and `welcome-otp` is not visible
- When they tap `welcome-submit` again and enter the new outbox code
- Then `home-screen` is visible.

**AC7. "Not you? Sign out" leaves onboarding.** `phase-3/onboarding-sign-out.yaml`
- Given a newcomer on `onboarding-name-screen`
- When they tap `onboarding-sign-out`
- Then `welcome-screen` is visible, and a relaunch stays on `welcome-screen`.

**AC8. Phase-2 flows run on a real session.** `phase-2/home-shell.yaml`,
`phase-2/home-shell-inert.yaml`, `phase-2/welcome-dev-links.yaml` (rewritten)
- `subflows/open-dev-home.yaml` is replaced by `subflows/open-home.yaml` (launch, reset, sign in
  as `person`). `home-avatar-initial` is asserted as "E", not "N".
- `home-shell-inert.yaml` no longer taps `home-settings-button`, which now navigates (AC3 owns it).
- `welcome-dev-links.yaml` asserts `welcome-dev-gallery` is visible and `welcome-dev-home` is
  **not**.
- `smoke/launch.yaml` is unchanged, and stays independent of the API.

**AC9. Non-flow checks.** The §7 unit and wire tests pass. `isPublicNativeRoute(["onboarding",
"name"])` and `(["settings"])` are `false`. `sanitizeReturnPath` allows `/settings` and refuses
`/onboarding/*`, so a returnTo cannot skip or re-enter onboarding.

**AC10. Resend counts down and sends a fresh code.** `phase-3/sign-in-resend.yaml`
- Given the code step for `e2e-person@kothanote.test`, straight after the send
- Then `welcome-resend` is disabled and reads "Resend in 0:{ss}"
- When the countdown ends
- Then it reads "Resend code" and is enabled
- When they tap it
- Then it counts down again, and the newest outbox code signs in to `home-screen`.

**Exit** (from phases.md): sign-up, sign-in, sign-out and relaunch-signed-in pass. `sign-out.yaml`
leaves `home-screen` through `home-settings-button`, not through `clearKeychain`. The whole
`--include-tags=phase-2,phase-3,smoke` suite passes on the iPhone 17 Pro simulator. The
cache-busted `bun run check` and `bun run test` are green. The "No sign-out in the app" entry is
removed from `BLOCKERS.md`.

## 9. Designed-here decisions and known gaps

- Every screen marked *(ours)* above was designed here, because discovery never saw it.
- The user type menu is an in-app popover, not a native `UIMenu`, so each option carries a testID
  (§2.4).
- There is no sign-out confirmation (§2.6).
- There is no live email client. Production email sign-in does not work until one is written. That
  was already true before this phase, and `parseConfig` now makes it a loud startup failure instead
  of a silent log line (recorded in `BLOCKERS.md`).
- The name is validated only by the client (1–80 characters after trimming). better-auth's
  `update-user` has no length rule, and wrapping it in our own endpoint would make a second writer
  of the `user` row.

## 10. Task lists

### API (`packages/domain`, `packages/server`, `packages/db`, `apps/api`, `packages/apiclient`)

1. `packages/db`: `schema/profiles.ts` and `schema/email-outbox.ts` (§6.1), exported from the
   schema barrel, both in `RESET_ORDER`. Then `bun run db:generate` for one migration.
2. `packages/domain`: extend `Domain/Profile.ts` with `UserType`, the extended `Profile` and
   `ProfilePatch`, plus `Profile.test.ts`. Add `patchMeRoute` and `completeOnboardingRoute` to
   `Profile/Contract.ts`. Add `EmailUnavailable` (503) to a new `Email/Errors.ts`.
3. `packages/server/Profiles`: `ProfilesRepo.byId` left-joins `profiles`. Add `upsertDetails` and
   `markOnboarded` (coalesce upsert). Add `canEditProfile` in `Policy.ts`. Add
   `ProfilesService.update` and `completeOnboarding`. Two new lines in `Http.ts`. Tests 1–15.
4. `packages/server/Integrations/Email`: `Port.ts`, `EmailFake.ts` (sink, calls, scripted
   failure), `Email.test.ts`. `packages/server/Outbox/OutboxRepo.ts` (`append`, `latestOtpFor`).
5. `packages/server/AuthEmails/AuthEmailsService.ts` and its test (§4 copy).
6. `Runtime/AppConfig.ts`: `EMAIL_MODE` and its production and live refusals. `Runtime/WorkerEnv.ts`
   gains `EMAIL_MODE` and `AUTH_RATE_LIMIT`. `container.ts` wires the email fake over `OutboxRepo`
   and exposes `authEmails`, with `traced()` on each.
7. `packages/server/E2E`: `GET /e2e/otp`, the `newcomer` fixture, the reset of the newcomer's
   rows, and seeding profile rows with `onboardedAt` (§6.6). `E2E.test.ts` cases.
8. `packages/auth`: state the OTP `otpLength: 6`, `expiresIn: 300` and `allowedAttempts: 3`
   explicitly in `createAuth`.
9. `apps/api`: `otpEmail` delegates to `authEmails.sendOtp` and stops logging the code.
   `authRateLimit` reads `AUTH_RATE_LIMIT`. Add `EMAIL_MODE` and `AUTH_RATE_LIMIT` to local `vars`
   and `EMAIL_MODE` to the dev `env` block in `wrangler.jsonc`, plus `.dev.vars.example` if needed.
   Tests 20–25.
10. `packages/apiclient`: `updateMe`, `completeOnboarding`, query keys, and test 26.
11. `packages/e2e`: the `Onboarding` journey (test 27), registered in `run.ts`.
12. `docs/plan/BLOCKERS.md`: add "No live email client". `docs/TESTING.md` names the new scenarios.

### Native (`apps/native`)

1. `src/design/TextField.tsx` and `FormRow.tsx` (§2.7), exported from the barrel, added to the
   gallery.
2. `src/lib/api.ts`: re-add `meQuery`, plus `useUpdateMe` and `useCompleteOnboarding` mutations
   over `@kn/apiclient`.
3. `src/features/auth/gate.ts` (pure `gateFor`), `errors.ts` (`welcomeErrorCopy`), and
   `name.ts` (`firstNameOf`), with tests 28–30. `useProtectedRoute` uses `gateFor`. The splash is
   held until the session resolves, and for a signed-in user until `meQuery` resolves. Add the
   boot error screen and silent sign-out on `ProfileNotFound`. `sanitizeReturnPath` allows
   `/settings`. `PUBLIC_SCREENS` is unchanged.
4. `src/features/auth/signOut.ts`: one `signOut()` used by settings, onboarding and boot error
   (`authClient.signOut()` with SecureStore cleared on failure, `queryClient.clear()`, replace to
   welcome).
5. `app/screens/welcome.tsx`: redesign per §2.1–2.2 with the new copy, `welcome-title`,
   `welcome-sent-to`, `welcome-resend` (30s countdown), `welcome-change-email` and `welcome-error`.
   Auto-submit on the sixth digit. Remove "Preview home".
6. `app/onboarding/_layout.tsx`, `name.tsx`, `about.tsx` (with the user type popover) and
   `ready.tsx` (§2.3–2.5).
7. `app/settings/index.tsx` (§2.6). `HomeShell`'s `home-settings-button` pushes `/settings`.
8. Delete `app/dev/home.tsx` and `.maestro/subflows/open-dev-home.yaml`. Add
   `subflows/open-home.yaml`, `e2e-reset.yaml`, `sign-in.yaml`, `relaunch-app.yaml` and
   `scripts/e2e-reset.js`, `read-otp.js`. Rewrite the phase-2 flows (AC8). Add `phase-3/*` to
   `config.yaml`. Update `scripts/maestro.sh` to pass `API_URL` and `E2E_SECRET`.
9. The eight phase-3 flows in §8 (AC1–AC7 and AC10; AC8 rewrites the phase-2 flows), then a visual check of the screenshots against #04, #81, #82 and
   #84 per `docs/TESTING.md` §8.
10. `docs/plan/BLOCKERS.md`: remove "No sign-out in the app" once AC3 passes.
