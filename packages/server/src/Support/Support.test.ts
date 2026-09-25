import { EmailUnavailable } from "@gc/domain/Email/Errors";
import { ProfileNotFound } from "@gc/domain/Profile/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import { buildContainer } from "../container";
import { E2E_USERS } from "../E2E/Fixtures";
import { makeEmailFake } from "../Integrations/Email/EmailFake";
import { makeProfilesRepo } from "../Profiles/ProfilesRepo";
import { makeDrizzle } from "../Runtime/Drizzle";
import type { Env } from "../Runtime/WorkerEnv";
import { fixedClock, makeTestD1, sequentialIds, type TestD1 } from "../Testing";
import * as Svc from "./SupportService";

// docs/spec/phase-10.md §7 cases 11–15: the support service over the email fake, with an array
// sink so what would reach the outbox is visible, and the real profiles repository over the world
// the E2E harness seeds, so the sender is the `E2E Person` the flows sign in as (§4, "Emails sent
// through the fake Email port").
//
// Names these tests fix where the spec leaves them open: `makeSupportService({ clock, email, ids,
// profiles })` with `profiles` the profiles repository, and the methods
// `createBugReport(actor, { message, includeDiagnostics, appVersion })`,
// `createFeedback(actor, { message, appVersion })` and `createDesktopReminder(actor)`, each
// answering the `SupportReceipt` `{ id }`.

const AT = Date.UTC(2026, 8, 25, 12);
const VERSION = "1.0.0 (1)";
const RECEIPT_ID = /^sup_/;

const person: Actor = E2E_USERS.person;

type Receipt = { readonly id: string };
type SupportService = {
  createBugReport: (
    who: Actor,
    input: { appVersion: string; includeDiagnostics: boolean; message: string }
  ) => Promise<Receipt>;
  createDesktopReminder: (who: Actor) => Promise<Receipt>;
  createFeedback: (
    who: Actor,
    input: { appVersion: string; message: string }
  ) => Promise<Receipt>;
};
type Sent = {
  readonly body: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, string>>;
  readonly subject: string;
  readonly to: string;
};

const envOver = (db: TestD1) =>
  ({
    API_URL: "http://localhost:3001",
    BETTER_AUTH_SECRET: "auth-secret-32-characters-long-000000",
    BETTER_AUTH_URL: "http://localhost:3001",
    DB: db,
    E2E_HARNESS: "true",
    E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
    FLAGS_MODE: "fake",
    NATIVE_SCHEME: "gcnotes",
    NODE_ENV: "test",
  }) satisfies Env;

let d1: TestD1;
let written: Sent[];
let email: ReturnType<typeof makeEmailFake>;

beforeEach(async () => {
  d1 = makeTestD1();
  const harness = buildContainer(envOver(d1)).e2e;
  if (harness === null) {
    throw new Error("an armed configuration built no harness");
  }
  await harness.seed();
  written = [];
  email = makeEmailFake({
    sink: (message) => {
      written.push(message as Sent);
      return Promise.resolve();
    },
  });
});

afterEach(() => {
  d1.close();
});

const service = (): SupportService =>
  Svc.makeSupportService({
    clock: fixedClock(AT),
    email,
    ids: sequentialIds(),
    profiles: makeProfilesRepo(makeDrizzle(d1)),
  });

// Throws rather than asserting: a helper outside `it()` may not hold an `expect`.
const onlySent = (): Sent => {
  const [message, ...more] = written;
  if (message === undefined || more.length > 0) {
    throw new Error(
      `expected exactly one message, the sink got ${written.length}`
    );
  }
  return message;
};

describe("SupportService.createBugReport", () => {
  // §7 case 11
  it("sends one bug-report message to support, naming the version, the sender and the diagnostics", async () => {
    const receipt = await service().createBugReport(person, {
      appVersion: VERSION,
      includeDiagnostics: true,
      message: "  Steps: tapped Share twice  ",
    });

    const sent = onlySent();
    expect(email.calls).toHaveLength(1);
    expect(sent.kind).toBe("bug-report");
    expect(sent.to).toBe("support@notes.example");
    expect(sent.subject).toBe(
      "Bug report from Notes 1.0.0 (1) | e2e-person@gcnotes.test"
    );
    expect(sent.body).toContain("Steps: tapped Share twice");
    expect(sent.body).not.toContain("  Steps");
    expect(sent.body).toContain("Diagnostics: included");
    expect(sent.body).toContain("From: E2E Person e2e-person@gcnotes.test");
    expect(sent.payload).toMatchObject({
      appVersion: VERSION,
      from: "e2e-person@gcnotes.test",
      includeDiagnostics: "true",
    });
    expect(receipt.id).toMatch(RECEIPT_ID);
    expect(sent.payload.receiptId).toBe(receipt.id);
  });

  // §7 case 12
  it("says the diagnostics were not included when the toggle was off", async () => {
    await service().createBugReport(person, {
      appVersion: VERSION,
      includeDiagnostics: false,
      message: "Steps: tapped Share twice",
    });

    const sent = onlySent();
    expect(sent.body).toContain("Diagnostics: not included");
    expect(sent.payload.includeDiagnostics).toBe("false");
  });

  it("is ProfileNotFound for a caller whose account is gone, and sends nothing", async () => {
    await d1.prepare("DELETE FROM user WHERE id = ?").bind(person.id).run();

    await expect(
      service().createBugReport(person, {
        appVersion: VERSION,
        includeDiagnostics: true,
        message: "Steps",
      })
    ).rejects.toBeInstanceOf(ProfileNotFound);
    expect(written).toEqual([]);
  });
});

describe("SupportService.createFeedback", () => {
  // §7 case 13
  it("sends one feedback message to support, signed with the sender's name", async () => {
    const receipt = await service().createFeedback(person, {
      appVersion: VERSION,
      message: "Love the search",
    });

    const sent = onlySent();
    expect(sent.kind).toBe("feedback");
    expect(sent.to).toBe("support@notes.example");
    expect(sent.subject).toBe(
      "Feedback on Notes 1.0.0 (1) | e2e-person@gcnotes.test"
    );
    expect(sent.body).toContain("Love the search");
    expect(sent.body.endsWith("Sincerely,\nE2E Person")).toBe(true);
    expect(sent.payload).toMatchObject({
      appVersion: VERSION,
      from: "e2e-person@gcnotes.test",
    });
    expect(receipt.id).toMatch(RECEIPT_ID);
    expect(sent.payload.receiptId).toBe(receipt.id);
  });
});

describe("SupportService.createDesktopReminder", () => {
  // §7 case 14
  it("mails the caller their own link to the desktop app", async () => {
    const receipt = await service().createDesktopReminder(person);

    const sent = onlySent();
    expect(sent.kind).toBe("desktop-reminder");
    expect(sent.to).toBe("e2e-person@gcnotes.test");
    expect(sent.subject).toBe("Get Notes for Mac or Windows");
    expect(sent.body).toContain("https://notes.example/desktop");
    expect(sent.payload.link).toBe("https://notes.example/desktop");
    expect(receipt.id).toMatch(RECEIPT_ID);
    expect(sent.payload.receiptId).toBe(receipt.id);
  });
});

describe("SupportService when email is down", () => {
  // §7 case 15: the port's EmailUnavailable (503) propagates, and nothing reaches the outbox.
  it.each([
    [
      "a bug report",
      (svc: SupportService) =>
        svc.createBugReport(person, {
          appVersion: VERSION,
          includeDiagnostics: true,
          message: "Steps",
        }),
    ],
    [
      "feedback",
      (svc: SupportService) =>
        svc.createFeedback(person, { appVersion: VERSION, message: "Hi" }),
    ],
    [
      "a desktop reminder",
      (svc: SupportService) => svc.createDesktopReminder(person),
    ],
  ])(
    "raises EmailUnavailable for %s and records nothing as sent",
    async (_what, send) => {
      email.failWith("unavailable");

      await expect(send(service())).rejects.toBeInstanceOf(EmailUnavailable);
      expect(written).toEqual([]);
    }
  );
});
