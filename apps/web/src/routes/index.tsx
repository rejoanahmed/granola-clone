import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@web/components/chrome";
import { PhoneMock } from "@web/components/phone";
import { SITE } from "@web/site";

// The landing page (D033). Section order and rhythm follow a common product-page pattern: hero,
// three promises, features, how it works, a closer look, privacy, open source, FAQ, support. Every
// word and picture here is original.
// Canonical and og:url per page, not in the root, or every page would claim to be the home page.
export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    links: [{ href: `${SITE.url}/`, rel: "canonical" }],
    meta: [{ content: `${SITE.url}/`, property: "og:url" }],
  }),
});

const PROMISES = [
  {
    body: "Recordings, transcripts and notes live in a database and storage bucket in your own Cloudflare account. We never see them.",
    title: "Your server, nobody else's",
  },
  {
    body: "Meetings that jump between Bangla and English stay readable: transcribed as spoken, written up in the language you used.",
    title: "Bengali, English, or both",
  },
  {
    body: "The whole server is open source. One command sets it up; run it again to update.",
    title: "Open source, one command",
  },
] as const;

const FEATURES = [
  {
    body: "Tap record and put the phone down. It keeps listening with the screen off, and your typed notes join the transcript.",
    title: "One tap to record",
  },
  {
    body: "A full transcript of every meeting. Add an ElevenLabs key and it tells the speakers apart, even across languages.",
    title: "Transcripts you can trust",
  },
  {
    body: "Topics, decisions and next steps, with names on each action. Written in the language the meeting was held in.",
    title: "Notes that write themselves",
  },
  {
    body: "Ask a question across every meeting and get an answer that cites the notes it came from.",
    title: "Ask your meetings",
  },
  {
    body: "Search titles, notes and people. Put meetings in folders. Find the one where the budget was decided.",
    title: "Search and folders",
  },
  {
    body: "Free models in your Cloudflare account by default. Bring a Claude, OpenAI-compatible or ElevenLabs key when you want more.",
    title: "Your models, your keys",
  },
] as const;

const STEPS = [
  {
    body: "Run one command on your computer. It creates the database, storage and queues in your Cloudflare account and deploys your server.",
    code: "bun run selfhost",
    title: "Deploy your server",
  },
  {
    body: "Scan the QR code the setup prints, or type the address and pairing token into the app. Only that token can sign in.",
    code: "kothanote://connect",
    title: "Pair your iPhone",
  },
  {
    body: "Start a recording when the meeting starts. A few minutes after it ends, the transcript and the notes are waiting.",
    code: "● Recording 00:35:12",
    title: "Record your meeting",
  },
] as const;

const PRIVACY_POINTS = [
  "Audio is stored in your own R2 bucket and deleted from the phone once uploaded.",
  "Notes, transcripts and chats are in your own D1 database.",
  "AI runs on Workers AI in your account, through your AI Gateway, with logging off.",
  "An outside service (ElevenLabs, Anthropic, an OpenAI-compatible API) is used only if you add its key.",
  "The app has no ads, no analytics and no tracking.",
] as const;

const FAQ = [
  {
    a: "No. You need a free Cloudflare account and a computer for ten minutes. The setup guide walks through every step, and the setup command does the rest.",
    q: "Do I need to know how servers work?",
  },
  {
    a: "A few meetings a week fits inside Cloudflare's free tiers. Heavier use of Workers AI costs about $0.0005 per minute of audio. If you add an outside service, it bills you directly: ElevenLabs is about $0.20 per hour of audio.",
    q: "What does it cost to run?",
  },
  {
    a: "The free default handles English well and Bengali roughly. For meetings in Bengali or mixed Bengali and English, add an ElevenLabs key: it is far more accurate and keeps English words in English.",
    q: "How good is the Bengali?",
  },
  {
    a: "No. The app talks only to the server address you give it, in your account. There is no server of ours for your recordings to reach.",
    q: "Can anyone at Kothanote hear my meetings?",
  },
  {
    a: "Not yet. Kothanote is iPhone-first, and an Android version is planned.",
    q: "Is there an Android app?",
  },
  {
    a: "Today each server has one owner, paired by a token. You can pair more than one of your own phones to it.",
    q: "Can my team share one server?",
  },
  {
    a: "Your data stays where it is: in your account. Delete the server, database and bucket in the Cloudflare dashboard and it is gone. There is no other copy.",
    q: "What if I want to stop?",
  },
] as const;

function Landing() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-accent-olive-dark blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pt-16 pb-20 md:grid-cols-[1.1fr_1fr] md:pt-24">
            <div>
              <p className="font-semibold text-accent-lime text-sm uppercase tracking-[0.14em]">
                Private meeting notes · বাংলা + English
              </p>
              <h1 className="mt-5 text-balance font-serif text-5xl leading-[1.05] md:text-6xl">
                Your meetings, written up. On a server only you own.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-text-secondary leading-relaxed">
                {SITE.name} records the conversation, transcribes it in Bengali,
                English or both, and turns it into notes you can search and ask
                about. It all runs in your own Cloudflare account, so nobody
                else ever hears a word.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a
                  className="rounded-full bg-accent-lime px-6 py-3 font-semibold text-text-on-light hover:opacity-90"
                  href={SITE.selfHosting}
                >
                  Set up your server
                </a>
                <a
                  className="rounded-full border border-border-hairline px-6 py-3 font-semibold hover:bg-bg-tile"
                  href={SITE.repo}
                >
                  View the source
                </a>
              </div>
              <p className="mt-5 text-sm text-text-tertiary">
                {SITE.appStore === null ? (
                  "iPhone app coming soon to the App Store."
                ) : (
                  <a className="underline" href={SITE.appStore}>
                    Download on the App Store
                  </a>
                )}
              </p>
            </div>
            <PhoneMock />
          </div>
        </section>

        {/* Promises */}
        <section className="border-border-hairline border-y bg-bg-list">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-3">
            {PROMISES.map((p) => (
              <div key={p.title}>
                <h2 className="font-serif text-2xl">{p.title}</h2>
                <p className="mt-3 text-text-secondary leading-relaxed">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-5 py-24" id="features">
          <h2 className="max-w-2xl text-balance font-serif text-4xl md:text-5xl">
            Everything a meeting leaves behind, in one place.
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                className="rounded-3xl border border-border-hairline bg-bg-tile p-7"
                key={f.title}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-olive-dark">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent-lime" />
                </span>
                <h3 className="mt-5 font-semibold text-lg">{f.title}</h3>
                <p className="mt-2 text-text-secondary leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="bg-bg-list" id="how">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <h2 className="font-serif text-4xl md:text-5xl">
              Three steps, once.
            </h2>
            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li className="rounded-3xl bg-bg-app p-7" key={s.title}>
                  <span className="font-serif text-5xl text-accent-lime">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-semibold text-lg">{s.title}</h3>
                  <p className="mt-2 text-text-secondary leading-relaxed">
                    {s.body}
                  </p>
                  <code className="mt-5 block rounded-xl bg-bg-list px-4 py-3 text-accent-lime text-sm">
                    {s.code}
                  </code>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Bilingual */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 md:grid-cols-2">
          <div>
            <h2 className="text-balance font-serif text-4xl md:text-5xl">
              Built for meetings that switch languages mid-sentence.
            </h2>
            <p className="mt-6 text-lg text-text-secondary leading-relaxed">
              Real meetings in Dhaka do not stay in one language. {SITE.name}{" "}
              keeps the Bangla in Bangla script and the English words in
              English, then writes the notes the way your team actually talks.
            </p>
          </div>
          <div className="grid gap-3 rounded-3xl border border-border-hairline bg-bg-tile p-6 text-[15px]">
            <p>
              <span className="mr-2 rounded-full bg-accent-olive px-2 py-0.5 text-xs">
                A
              </span>
              আজকে আমরা Q1 budget নিয়ে কথা বলব।
            </p>
            <p>
              <span className="mr-2 rounded-full bg-bg-tile-raised px-2 py-0.5 text-xs">
                B
              </span>
              Marketing-এর খরচ একটু কমাতে হবে, maybe fifteen percent।
            </p>
            <p>
              <span className="mr-2 rounded-full bg-accent-olive px-2 py-0.5 text-xs">
                A
              </span>
              ঠিক আছে, Thursday-র মধ্যে final করি।
            </p>
            <div className="mt-2 rounded-2xl bg-bg-list p-4">
              <p className="font-semibold text-accent-lime text-xs uppercase tracking-widest">
                Note
              </p>
              <p className="mt-2">
                <b>Decision:</b> Marketing খরচ ১৫% কমানো হবে; budget Thursday-র
                মধ্যে final।
              </p>
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section className="bg-bg-list" id="privacy">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 md:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="text-balance font-serif text-4xl md:text-5xl">
                What leaves your server? Nothing you didn't choose.
              </h2>
              <Link
                className="mt-6 inline-block text-accent-lime underline"
                to="/privacy"
              >
                Read the privacy policy
              </Link>
            </div>
            <ul className="grid gap-4">
              {PRIVACY_POINTS.map((point) => (
                <li
                  className="flex gap-4 rounded-2xl bg-bg-app p-5"
                  key={point}
                >
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-lime" />
                  <span className="text-text-secondary leading-relaxed">
                    {point}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Open source */}
        <section className="mx-auto max-w-6xl px-5 py-24">
          <div className="rounded-[36px] border border-border-hairline bg-bg-tile p-8 md:p-14">
            <h2 className="max-w-2xl text-balance font-serif text-4xl md:text-5xl">
              Open source, and yours in one command.
            </h2>
            <p className="mt-5 max-w-2xl text-lg text-text-secondary leading-relaxed">
              Read every line of the server before you run it. The setup creates
              what is missing and leaves the rest alone, so running it again is
              how you update.
            </p>
            <pre className="mt-8 overflow-x-auto rounded-2xl bg-bg-list p-5 text-sm leading-relaxed">
              <code>
                <span className="text-text-tertiary">
                  # once, on any Mac or Linux computer
                </span>
                {"\n"}git clone {SITE.repo}.git{"\n"}cd{" "}
                {SITE.repo.split("/").at(-1)}
                {"\n"}bun install{"\n"}
                <span className="text-accent-lime">bun run selfhost</span>
                {"\n"}
                <span className="text-text-tertiary">
                  # Bengali meetings? bun run selfhost -- --language bn
                </span>
              </code>
            </pre>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                className="rounded-full bg-accent-lime px-6 py-3 font-semibold text-text-on-light hover:opacity-90"
                href={SITE.selfHosting}
              >
                Read the setup guide
              </a>
              <a
                className="rounded-full border border-border-hairline px-6 py-3 font-semibold hover:bg-bg-app"
                href={SITE.repo}
              >
                GitHub
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-5 pb-24" id="faq">
          <h2 className="font-serif text-4xl md:text-5xl">Questions</h2>
          <div className="mt-10 divide-y divide-border-hairline border-border-hairline border-y">
            {FAQ.map((item) => (
              <details className="group py-5" key={item.q}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-semibold text-lg">
                  {item.q}
                  <span className="text-accent-lime transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-text-secondary leading-relaxed">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Support */}
        <section className="bg-bg-list" id="support">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-16 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-serif text-3xl">Need a hand?</h2>
              <p className="mt-2 text-text-secondary">
                Email us at {SITE.supportEmail}, or open an issue on GitHub. We
                answer both.
              </p>
            </div>
            <div className="flex gap-3">
              <a
                className="rounded-full bg-accent-lime px-6 py-3 font-semibold text-text-on-light hover:opacity-90"
                href={`mailto:${SITE.supportEmail}`}
              >
                Email support
              </a>
              <a
                className="rounded-full border border-border-hairline px-6 py-3 font-semibold hover:bg-bg-app"
                href={`${SITE.repo}/issues`}
              >
                Open an issue
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
