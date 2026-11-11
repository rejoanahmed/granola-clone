# Set up your own server

The app keeps your meetings private by never sending them to us. Your recordings, transcripts and
notes live on **your own server**, in **your own Cloudflare account**. This guide sets one up. It
takes about ten minutes, and you do it once.

You don't need to know how servers work. You need:

- **A Cloudflare account.** Sign up free at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
- **R2 storage turned on in that account.** In the dashboard, open **R2 Object Storage** and click
  **Enable**. The free tier (10 GB) holds hundreds of hours of meetings. Cloudflare may ask for a
  payment method first. You won't be charged within the free limits.
- **A computer (Mac, Linux, or Windows with WSL)** for the setup. Your phone is not enough for this
  step. After setup you never need the computer again.

## 1. Install the tools (once)

Open **Terminal** and paste these two lines, one at a time:

```bash
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/rejoanahmed/kothanote.git && cd kothanote && bun install
```

The first line installs [Bun](https://bun.sh), which runs the setup. The second downloads the
server's code. Close Terminal and open it again if the shell says `bun: command not found`.

## 2. Create your server (one command)

```bash
bun run selfhost
```

The first time, a browser window opens so you can log in to Cloudflare and click **Allow**. The
script then does everything else in your account:

1. creates a database (D1), a storage bucket for audio (R2), and two work queues;
2. creates the tables your notes live in;
3. deploys your server to a free `….workers.dev` address;
4. makes a secret **pairing token**, the password your phone uses to sign in;
5. checks that the server answers.

At the end it prints something like this:

```
Your server is ready.
  Server URL:     https://kothanote-server.your-name.workers.dev
  Pairing token:  9s7G…
```

It also prints a link and a QR code.

## 3. Connect your iPhone

Open the app and choose **one** of these:

- scan the QR code with the iPhone camera and tap the link; or
- type the **Server URL** and **Pairing token** into the app's connect screen.

Then tap **Connect**. You're in. Only someone who has your pairing token can sign in, so keep it
private, as you would a password.

## If your meetings are in Bengali (or mixed Bengali and English)

The default transcriber is free and runs in your Cloudflare account. It is good at English and
**poor at Bengali**. Tell it the language at least:

```bash
bun run selfhost -- --language bn
```

For **much better Bengali** and mixed Bengali/English, including telling speakers apart, use
**ElevenLabs Scribe**. It costs about **$0.20 per hour** of audio, and new ElevenLabs accounts
include some free hours.

1. Create an account at [elevenlabs.io](https://elevenlabs.io), then open **Developers → API keys**
   and create a key.
2. Run:

   ```bash
   bun run selfhost -- --transcription elevenlabs --language bn
   ```

   and paste the key when asked. It is stored on your server only.

## Better notes (optional)

The free note writer runs in your Cloudflare account. It writes good notes in Bengali and English,
and it takes up to a minute per meeting. For faster and sharper notes, use **Claude**. It needs an
Anthropic API key from [console.anthropic.com](https://console.anthropic.com), and a one-hour
meeting costs well under one US cent with the default model.

```bash
bun run selfhost -- --llm anthropic                                # Claude Haiku: fast and cheap
bun run selfhost -- --llm anthropic --llm-model claude-sonnet-5-5  # Claude Sonnet: the best notes
```

Any OpenAI-compatible service works too:

```bash
bun run selfhost -- --llm openai --llm-model gpt-4.1-mini
bun run selfhost -- --llm openai --llm-base-url https://generativelanguage.googleapis.com/v1beta/openai --llm-model gemini-3.6-flash
```

## Privacy settings

- **Where your data is.** Audio and transcripts are in your R2 bucket (`kothanote-audio`). Notes and
  your account are in your D1 database (`kothanote-db`). Both are in your Cloudflare account, and
  you can see them in the dashboard.
- **AI Gateway.** Every AI request passes through Cloudflare **AI Gateway** in your own account
  (the gateway named `default`). It shows you usage and cost, and lets you add rate limits.
  **Logging of prompts and answers is off.** Your transcripts and notes are not stored there.
  To turn logging on for debugging:

  ```bash
  bun run selfhost -- --gateway-logs on     # and --gateway-logs off to stop
  ```

  To skip AI Gateway entirely, use `--gateway off`. To use a gateway you made yourself (dashboard →
  **AI → AI Gateway → Create**), use `--gateway <its-id>`.
- **Outside vendors.** If you add an ElevenLabs or Anthropic key, the audio or transcript for each
  meeting goes to that company to be processed, under *your* account with them. With the defaults,
  nothing leaves Cloudflare.

## Everyday things

| I want to… | Run |
| --- | --- |
| See my server URL and pairing token again | `bun run selfhost -- --show` |
| Update my server to the newest version | `git pull && bun install && bun run selfhost` |
| Change the pairing token (e.g. it leaked) | `bun run selfhost -- --rotate-token` |
| Connect a second iPhone | open the app on it and connect with the same URL and token |

Your choices (language, providers) are remembered in `apps/api/.selfhost.env`, so a later
`bun run selfhost` keeps them. That file holds your pairing token. Don't share it or commit it.

## What it costs

Light personal use (a few meetings a week) stays inside Cloudflare's free tiers: Workers, D1, R2
(10 GB), Queues and Workers AI's daily allowance. Heavy use of Workers AI past the free daily
allowance costs about $0.0005 per audio minute for transcription. Cloudflare's dashboard shows
your usage. Outside vendors bill you directly.

## If something goes wrong

- **"R2 is not enabled"**: enable R2 in the dashboard (see the list at the top), then run again.
- **"Your login can reach several accounts"**: run
  `CLOUDFLARE_ACCOUNT_ID=<the id to use> bun run selfhost`.
- **The app says it can't reach the server**: a new `workers.dev` address can take a minute to
  start answering. Check that `curl <your server URL>/server` prints `"auth":"owner"`.
- **A recording stays on "Transcribing"**: transcripts are collected every two minutes, and a long
  meeting takes a few minutes to transcribe. Run `bunx wrangler tail kothanote-server` in `apps/api`
  to watch the server's log.
- Running the setup again is always safe. It only creates what is missing.

## Removing your server

In the Cloudflare dashboard, delete the Worker `kothanote-server`, the D1 database `kothanote-db`, the
R2 bucket `kothanote-audio` (empty it first), and the two `kothanote-*-selfhost` queues. That deletes
your recordings and notes. There is no other copy.
