# Release plan: public App Store, bring-your-own-server

What stands between this branch and a public App Store listing, in order. The code side is
`docs/spec/phase-13.md`; this file is the owner's checklist. Nothing here has been done to App Store
Connect, Apple's developer program or any vendor account. Those need the owner's own logins.

## 1. The name: Kothanote (chosen, D030)

The rename is done. What follows is the record of how it was chosen.

### How it was chosen

"granola-clone" cannot ship, and "Notes" is the system app's name. The name is one object,
`packages/domain/src/Brand.ts` (D023). After choosing:

```bash
# 1. edit packages/domain/src/Brand.ts: displayName, slug, scheme, bundleId
# 2. rewrite the copies that cannot import it (Maestro appIds, wrangler names, selfhost.sh):
scripts/rename-brand.sh kothanote <new-slug> com.rovierr.kothanote com.rejoanahmed.<new-slug> "<Display Name>"
bun run check && bun run test
```

Candidates were checked on 2026-11-11. **These are preliminary checks, not legal clearance.**
Domains were checked through RDAP (Google Registry for `.app`, Verisign for `.com`; a 404 means
probably unregistered). App Store, company and trademark conflicts were checked by web search. USPTO,
WIPO, Bangladesh DPDT and App Store Connect name reservations were **not** checked.

| Name | Meaning | App Store / company conflicts found | `.app` | `.com` | Risk |
| --- | --- | --- | --- | --- | --- |
| **Shonanote** | Bangla *shona* (listen) + note | none found | free | free | low |
| **Kothanote** | Bangla *kotha* (talk) + note | none exact; unrelated "Kotha" chat app and "Kothon" calling app | free | free | low–med |
| **Kothly** | coined from *kotha* | none exact; same nearby Kotha apps | free | free | low–med |
| **Memokhata** | memo + Bangla *khata* (notebook) | none found ("Khatabook" is a different ledger brand) | free | free | low–med |
| **Smritinote** | *smriti* (memory) + note | none found; harder to spell | free | free | low–med |
| **Lekhanote** | Bangla *lekha* (writing) + note | "Lekh" whiteboard app and "Lekh AI" are close | free | free | med |
| **OwnMinutes** | your own minutes, on your own server | crowded "Minutes" category (Minutes AI, MinuteKeep…) | free | free | med |
| **Minutehold** | where your minutes are held | same "Minute*" crowd | free | free | med |

**A second round** (the own-server / private angle, 2026-11-11, same method) found these with
both domains free and no matching app or company: **Minuteden** (a den for your minutes),
**Tacinote** (Latin *tacitus*, kept quiet), **Minukeep** (minutes you keep), Clausanote (Latin
*clausa*, sealed), Sealminute, Sigilnote, Minuvault ("vault" is crowded). Keepmeet, Coffernote and
Ownroom have only `.app` free.

**Combined ranking:**
1. Minuteden
2. Shonanote
3. Tacinote
4. Kothanote
5. Minukeep
6. Kothly
7. Sigilnote
8. Memokhata

The top three are the shortest names that are easy to say, have both domains free, and showed no
conflicts.

Rejected for clear conflicts: Ownscribe (open-source meeting transcriber of the same name), NoteCove,
MinuteOwl, Hushnote/HushScribe, Lekho/Lekhapad, Shunly (`.com` taken). Most short real words in
Bengali or English (Lekha, Khata, Shuno, Kotha, Smriti, Lipi…) are taken in both TLDs. No domain
was registered in the end: the site is https://rovierr.com/kothanote and the address is
kothanote@rovierr.com (D035). Before submitting, also search App Store Connect's name field,
which rejects a name another developer already holds.

## 2. Make the server code public: done (2026-11-11). Rename the repository next.

The repository is public. Its name still carries the reference product's name, and the landing
page and `SELF-HOSTING.md` already link to `rejoanahmed/kothanote`. Rename it once, then redeploy
the site so its links resolve:

```bash
gh repo rename kothanote --repo rejoanahmed/granola-clone   # GitHub redirects the old URL
git remote set-url origin https://github.com/rejoanahmed/kothanote.git
bun run deploy:web   # serves https://rovierr.com/kothanote (D035)
```


`SELF-HOSTING.md` tells users to `git clone` this repository, and it is private. Self-hosting is
impossible for anyone else until either:

- this repository is made public (it contains no secrets: ids are substituted at deploy, and
  `.selfhost.env` is gitignored), or
- the server half (`apps/api`, `packages/*`, `scripts/selfhost.sh`) is published as its own public
  repo, with `SELF-HOSTING.md` pointing there.

A public repo is also what a "Deploy to Cloudflare" button needs (D019). The guide's URL and the
app's `LINKS.selfHosting` (`apps/native/src/features/settings/links.ts`) must point at a page that
exists. A GitHub-rendered `SELF-HOSTING.md` is enough.

## 3. EAS, Apple and Google (owner only)

EAS mirrors Chapterly's setup, on the same owner (`rovierr`) and Apple team (`BXW3A78H2C`, D034).
Run these from `apps/native`, in order:

1. `bunx eas-cli init`. This creates the EAS project under `rovierr` and writes the id into
   **`apps/native/app.json` → `expo.extra.eas.projectId`**. If eas-cli says it cannot edit the
   dynamic config, paste the printed id there yourself. Commit it.
2. `bunx eas-cli update:configure`. This adds `expo.updates.url` (`https://u.expo.dev/<projectId>`)
   to the same file. The channels already match the build profiles. Commit.
3. `bunx eas-cli build -p ios --profile production`. When asked, **reuse** the team's existing
   distribution certificate (Chapterly's). Let EAS register the App ID and create a new
   provisioning profile for `com.rovierr.kothanote`: profiles are always per bundle id.
4. Create the App Store Connect record (Apps → + → New App, bundle id `com.rovierr.kothanote`).
   Done: EAS auto-submit created it, and its numeric Apple ID **6833328794** is
   `eas.json` → `submit.{internal,production}.ios.ascAppId` (Chapterly's is `6826753742`).
5. `bunx eas-cli submit -p ios --latest --profile production`. Pick the account's existing **App
   Store Connect API key** when asked; it is the one Chapterly submits with.

Android is configured but not built or tested (see §9). When you want it:

- Create the app in Play Console (`com.kothanote.app`). The first AAB must be uploaded by hand
  there: Google's API cannot create the first release.
- `bunx eas-cli build -p android --profile production`. With no choice made, EAS **generates a new
  upload keystore for this app**. That is the recommended path, since a keystore is per app on Play.
- To deliberately use Chapterly's keystore instead (not recommended): in Chapterly's project run
  `bunx eas-cli credentials -p android` → `production` → *Keystore: Manage everything needed to build
  your project* → *Download existing keystore*. Then in `apps/native` here run the same menu →
  *Set up a new keystore* → *I want to upload my own file*, and give it that `.jks` with its
  passwords.
- Submit: `bunx eas-cli credentials -p android` → `production` → *Google Service Account* →
  *Manage your Google Service Account Key for Play Store Submissions* → *Use an existing Google
  Service Account Key* → pick Chapterly's. Then, in Play Console → Users and permissions, give that
  service account access to Kothanote. Then `bunx eas-cli submit -p android --latest`.

## 4. Assets the app still lacks

- **App icon**: done (D032), `bun run brand` regenerates it.
- **Screenshots**: 6.9" (1320×2868 or 1290×2796) at least, 3 to 10 of them. Take them from a dev
  build connected to the reference server: home with notes, a note with AI notes, the transcript
  sheet, Ask with citations, the connect screen.
- **Privacy policy URL** (required). The draft is `docs/legal/PRIVACY.md`, and every server serves
  it at `/privacy` (D029). Fill in its `TODO(Rex)` lines, run `bun scripts/render-privacy.ts`, and
  redeploy (`bun run selfhost`). The listing's URL is `https://rovierr.com/kothanote/privacy`.
- **Support URL**: `https://rovierr.com/kothanote/#support`; the address is kothanote@rovierr.com.
  `LINKS` in `features/settings/links.ts` points at the site (D035): no `notes.example` is left.

## 5. Build and submit

```bash
cd apps/native
bunx eas-cli build --platform ios --profile production   # cloud build; asks for the Apple login and creates certificates
bunx eas-cli submit --platform ios --latest              # uploads to App Store Connect (TestFlight first)
```

`eas.json`'s `production` profile already sets `EXPO_PUBLIC_APP_ENV=prod`, so the build ships with
no server address and starts at the connect screen. Test on TestFlight against the reference server
before submitting for review.

## 6. App Review: the BYO-server risks, and the answers

| Guideline | Risk | Answer prepared |
| --- | --- | --- |
| **2.1 App completeness** | A reviewer cannot use an app that needs a server they don't have. | The **reference server** (deployed from this branch to the owner's personal account) is the demo. Put its URL and pairing token in *App Review Information → Notes* (§7). Keep it running and its token unrotated during review. |
| **2.1 / 2.3 Placeholder content** | "Coming soon" pages, a desktop-app sheet, a work-email upsell, disabled attachments and dictation. | Hidden in release builds since D027. Check no other dead end has appeared before each submission. |
| **4.2 Minimum functionality** | "A front end to a server" can read as a thin client. | The app records natively (background audio), shows transcripts, writes AI notes and offers search, folders and Ask. Say so in the review notes. |
| **5.1.1 Privacy** | The app must explain data use and offer account deletion. | Delete account exists (Settings), and it deletes the data on the user's own server. The privacy policy (§4) states that no data reaches the developer. In App Store Connect's privacy section, **Data Not Collected** is accurate *for the developer*. Say in the notes that data goes only to the user's server. |
| **5.1.2 Data use** | Recordings of other people. | The mic permission string and the first-run copy say what is recorded. Note-taking consent is the user's responsibility, as with any recorder. Consider an "inform participants" line in onboarding. |
| **2.5.2 / 3.1.1** | The app downloads no code and takes no payment. The user's vendor keys live on their server, not in the app. | Nothing to change. |
| **Guideline 4.0 / 4.8 login** | No third-party login is offered, so Sign in with Apple is not required (C1 is moot under D020). | Nothing to change. |

## 7. Review notes template

```
This app stores meetings only on a server the user deploys to their own Cloudflare account
(see the "How do I set up a server?" link on the first screen). For review, please connect to
our demo server:

  Server URL:     https://kothanote-server.bold-breeze-539b.workers.dev
  Pairing token:  <from apps/api/.selfhost.env on the owner's machine: bun run selfhost -- --show>

Steps: open the app → enter both → Connect → finish the two onboarding questions → tap the
record button, speak for 30 seconds, tap End. The transcript appears within about two minutes and
the AI notes about a minute later.
```

## 8. After launch

- Watch the reference server's cost. It runs on the owner's personal account, and reviewers and
  anyone holding the token can use its Workers AI allowance. Rotate the token after review:
  `bun run selfhost -- --rotate-token`.
- The Workers AI catalogue changes monthly. When the default model (D025) is deprecated, re-run
  the trial and move the default.

## 9. Android: what it would still need

The config is ready; the app is not. Before a Play release:
- **Background recording.** iOS records with the screen off via `enableBackgroundRecording`. On
  Android this needs a foreground service with a persistent notification
  (`FOREGROUND_SERVICE_MICROPHONE`), which expo-audio's plugin adds only when configured and which
  has not been tried.
- **The recorder, the upload queue and resume-on-launch** have only ever run on iOS.
- **UI built on iOS-only presentation.** Form sheets with detents (`formSheet`,
  `sheetAllowedDetents`), the native page-sheet chat and the keyboard-docked composer assume
  UIKit. On Android each screen needs checking and some need another presentation.
- **Tests.** Every Maestro flow targets the iOS simulator by UDID. An emulator lane is needed.
- **Store.** A Play listing, the Data safety form (the same facts as the privacy policy), a
  feature graphic, Android screenshots, and the first manual upload.
- **Deep links.** The `kothanote://connect` setup link works through the scheme. App Links over
  `https://rovierr.com` would need `assetlinks.json` at that origin's `/.well-known/`, which is the
  rovierr.com Worker's, not this site's (D035).
