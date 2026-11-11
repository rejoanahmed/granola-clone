# Privacy Policy

Last updated: 11 November 2026

Kothanote is a product of Rovierr (https://rovierr.com). This policy covers the iPhone app
Kothanote (the "app") and the server software it connects to, both published by Rovierr ("we",
"us"). It explains what happens to your data, who can see it, and the choices you have. Questions:
kothanote@rovierr.app.

## The short version

**We never receive your recordings, transcripts, notes or account details.** The app has no
server of ours to send them to. You run your own server in your own Cloudflare account, and the
app talks only to the server address you type in. We cannot see, access, sell or share what you
record, because it never reaches us.

The app has no advertising, no analytics, no crash reporting and no tracking.

## Where your data lives

When you set up the app, you deploy its server software into **your own Cloudflare account** (see
the setup guide). Everything the app stores is kept there, under your control:

| What | Where |
| --- | --- |
| Your account: name, the email address you configured (or a placeholder), and the profile details you choose to enter (company, job title, LinkedIn username, role) | your D1 database |
| Your notes, the notes you type during a meeting, folders, chat history with Ask, and your settings | your D1 database |
| Meeting audio recordings | your R2 storage bucket |
| Transcripts | your D1 database, and a working copy in your R2 bucket |
| Sign-in sessions | your D1 database |

Cloudflare operates the infrastructure your server runs on, under **your** agreement with
Cloudflare. Cloudflare's privacy policy is at https://www.cloudflare.com/privacypolicy/.

### On your iPhone

The app stores your server's address, a description of that server, and your sign-in session in
the iOS Keychain. A recording is saved on the phone while you record. It is deleted from the phone
once it has uploaded to your server. Nothing else is kept on the device outside the app's normal
cache.

## How your data is processed

By default, all processing happens inside your Cloudflare account:

- **Transcription** uses Cloudflare Workers AI (Whisper) in your account.
- **AI-written notes and Ask** use a Cloudflare Workers AI language model in your account.
- **AI Gateway.** Every AI request your server makes passes through Cloudflare AI Gateway in your
  account, so that you can see usage and set limits. **Logging of prompts and responses is turned
  off by default.** With logging off, AI Gateway does not store your transcripts or notes. If you
  turn logging on (an option in the setup tool), the gateway keeps a copy of each request and
  response in your account, and you can delete it there. Caching is off by default.

### Optional services you can turn on

Your server contacts an outside company **only if you give it that company's API key**. You then
use that company under your own account and its terms. Here is exactly what is sent:

| Service | Used for | What your server sends | When |
| --- | --- | --- | --- |
| **ElevenLabs** (speech-to-text) | Transcription | The meeting's audio file, and your language setting | Once per recording |
| **Anthropic** (Claude) | AI notes, Ask, chat titles | **Notes:** the transcript (speaker letters and timestamps), the notes you typed during the meeting, attendee names, and the meeting's start time. **Ask:** your question, the earlier messages in that chat, and the notes the server found relevant (title, date, the written notes and a transcript excerpt). **Titles:** your first question. | Once per meeting for notes; each time you ask |
| **An OpenAI-compatible service you choose** (for example OpenAI, Google Gemini, OpenRouter) | Same as Anthropic | The same as Anthropic | The same |
| **Resend** (email), only on a server set up for several people to sign in by email | Sign-in codes and support emails | The recipient's email address and the message | Each email |

These requests go through your AI Gateway, with the same logging setting described above. Each of
these companies has its own privacy policy and data-retention terms. Check them before you add a
key.

## Permissions the app asks for

- **Microphone.** Used to record a meeting when you tap record, including while the app is in the
  background during a recording. The app does not listen at any other time.
- The app asks for **no other permissions**. It does not ask for access to your calendar,
  contacts, photos or location, and it does not send notifications.

## Contacting us

If you send feedback or a bug report from the app while your server is not set up to send email,
the app opens your phone's own Mail app with a pre-filled message addressed to us. We receive it
only if you choose to send it. We use it only to reply and to fix problems, and we never add it to a mailing list. We
keep a support email for no longer than 12 months after the conversation ends, and we delete it
sooner if you ask.

## The demo server

For App Store review and evaluation, we run one demo server in our own Cloudflare account. If you
connect the app to **our demo server** rather than your own, what you record there is stored in our
account. The demo server is for Apple's App Review and for people we invite to try the app; its
pairing token is not published. We delete everything recorded on it after each review and at least
every 30 days. Do not record real meetings on the demo server.

## Keeping, deleting and exporting your data

Your data stays on your server until you delete it. You control it, not us.

- **Delete a note:** move it to trash in the app. Trashed notes are kept until you delete your
  account or your server.
- **Delete your account** (Settings → Profile → Delete Account): permanently deletes your account,
  notes, transcripts, chats, folders and settings from your database. The audio files and the
  transcript working copies in your R2 bucket are not yet removed automatically. Delete them in
  the Cloudflare dashboard, or delete the bucket.
- **Delete everything:** delete your server, database and bucket in your Cloudflare dashboard. The
  setup guide lists each one. There is no other copy, and we cannot restore it.
- **Export:** your data is in your own D1 database and R2 bucket, which you can export with
  Cloudflare's tools.

Because we never hold your data, we cannot answer a request to access, correct or delete it. You
can do each of those directly on your server.

## Recording other people

Recording a conversation may require the consent of the people in it, depending on where you are.
You are responsible for telling participants and getting any consent the law requires.

## Children

Kothanote is made for adults recording their own meetings. It is not directed to children under
13, and, as with all of Rovierr's products, anyone under 18 should use it only with a parent's or
guardian's knowledge. We do not knowingly collect data from children; we collect no data from
anyone.

## Security

The app talks to your server over HTTPS. Your server accepts sign-in only with the pairing token
created during setup, which only you hold. Your sign-in session is kept in the iOS Keychain. Keep
your pairing token private. If it leaks, change it with the setup tool.

## Changes to this policy

If this policy changes, we will update the date above and publish the new version at
https://kothanote.app/privacy. Every Kothanote server also shows the version it was built with at
its own `/privacy` address.

## Contact

Kothanote is published by Rovierr (https://rovierr.com). For questions about this policy, or
about anything you sent us, write to kothanote@rovierr.app.
