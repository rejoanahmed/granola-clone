# Release plan: public App Store, bring-your-own-server

What stands between this branch and a public App Store listing, in order. The code side is
`docs/spec/phase-13.md`; this file is the owner's checklist. Nothing here has been done to App Store
Connect, Apple's developer program or any vendor account. Those need the owner's own logins.

## 1. Choose the name (blocks everything below)

"granola-clone" cannot ship, and "Notes" is the system app's name. The name is one object,
`packages/domain/src/Brand.ts` (D023). After choosing:

```bash
# 1. edit packages/domain/src/Brand.ts: displayName, slug, scheme, bundleId
# 2. rewrite the copies that cannot import it (Maestro appIds, wrangler names, selfhost.sh):
scripts/rename-brand.sh gcnotes <new-slug> com.rejoan.gcnotes com.rejoanahmed.<new-slug> "<Display Name>"
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
Bengali or English (Lekha, Khata, Shuno, Kotha, Smriti, Lipi…) are taken in both TLDs. Register the
domain the day the name is chosen. Before submitting, also search App Store Connect's name field,
which rejects a name another developer already holds.

## 2. Make the server code public

`SELF-HOSTING.md` tells users to `git clone` this repository, and it is private. Self-hosting is
impossible for anyone else until either:

- this repository is made public (it contains no secrets: ids are substituted at deploy, and
  `.selfhost.env` is gitignored), or
- the server half (`apps/api`, `packages/*`, `scripts/selfhost.sh`) is published as its own public
  repo, with `SELF-HOSTING.md` pointing there.

A public repo is also what a "Deploy to Cloudflare" button needs (D019). The guide's URL and the
app's `LINKS.selfHosting` (`apps/native/src/features/settings/links.ts`) must point at a page that
exists. A GitHub-rendered `SELF-HOSTING.md` is enough.

## 3. Apple and Expo accounts (owner only)

1. **Apple Developer Program**: enrol at <https://developer.apple.com/programs/enroll/> ($99/year;
   an individual in Bangladesh can enrol, and identity verification can take days).
2. **Expo account**: `bunx eas-cli login` (create one at <https://expo.dev/signup> if needed), then
   from `apps/native`: `bunx eas-cli init` to link the project. It writes `extra.eas.projectId`;
   commit it.
3. **App Store Connect app record**: <https://appstoreconnect.apple.com> → Apps → **+** → New App:
   platform iOS, the chosen name, primary language English, bundle id = `BRAND.bundleId` (register
   it under Certificates, IDs & Profiles first, or let `eas build` create it), SKU = the slug.

## 4. Assets the app still lacks

- **App icon** (1024×1024 PNG, no transparency). There is none. Add `"icon": "./assets/icon.png"`
  to `app.json`. It needs the name first.
- **Screenshots**: 6.9" (1320×2868 or 1290×2796) at least, 3 to 10 of them. Take them from a dev
  build connected to the reference server: home with notes, a note with AI notes, the transcript
  sheet, Ask with citations, the connect screen.
- **Privacy policy URL** (required). The draft is `docs/legal/PRIVACY.md`, and every server serves
  it at `/privacy` (D029). Fill in its `TODO(Rex)` lines, run `bun scripts/render-privacy.ts`, and
  redeploy (`bun run selfhost`). Until a domain exists, the listing's URL is
  `https://gcnotes-server.bold-breeze-539b.workers.dev/privacy`.
- **Support URL** and a real support address: set `LINKS.help` and `LINKS.supportEmail`.
- Replace every `notes.example` link in `features/settings/links.ts`.

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

  Server URL:     https://gcnotes-server.bold-breeze-539b.workers.dev
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
