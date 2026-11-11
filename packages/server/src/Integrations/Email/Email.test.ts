import { EmailUnavailable } from "@kn/domain/Email/Errors";
import { describe, expect, it } from "vitest";
import { makeEmailFake } from "./EmailFake";

// The fake is what every local run, the E2E harness and each Maestro flow reads a sign-in code
// from, so what it writes and when it refuses are the whole contract. Its sink is injected:
// `container.ts` hands it the outbox repository, and this file hands it an array.

const MESSAGE = {
  body: "Your Kothanote code is 123456.",
  kind: "otp",
  payload: { otp: "123456", type: "sign-in" },
  subject: "Your Kothanote sign-in code",
  to: "rita@example.test",
} as const;

const arraySink = () => {
  const written: unknown[] = [];
  return {
    sink: (message: unknown) => {
      written.push(message);
      return Promise.resolve();
    },
    written,
  };
};

describe("the email fake", () => {
  // §7 case 16
  it("records each send, in order, and writes one row to its sink per send", async () => {
    const { sink, written } = arraySink();
    const email = makeEmailFake({ sink });

    await email.send(MESSAGE);
    await email.send({ ...MESSAGE, to: "other@example.test" });

    expect(email.calls).toEqual([
      MESSAGE,
      { ...MESSAGE, to: "other@example.test" },
    ]);
    expect(written).toHaveLength(2);
    expect(written[0]).toMatchObject(MESSAGE);
  });

  // §7 case 17
  it("raises EmailUnavailable (503) when scripted to, and writes nothing", async () => {
    const { sink, written } = arraySink();
    const email = makeEmailFake({ sink });
    email.failWith("unavailable");

    const sent = email.send(MESSAGE);

    await expect(sent).rejects.toBeInstanceOf(EmailUnavailable);
    await expect(sent).rejects.toMatchObject({ status: 503 });
    expect(written).toEqual([]);
  });

  it("sends again once reset", async () => {
    const { sink, written } = arraySink();
    const email = makeEmailFake({ sink });
    email.failWith("unavailable");
    await expect(email.send(MESSAGE)).rejects.toBeInstanceOf(EmailUnavailable);

    email.reset();
    await email.send(MESSAGE);

    expect(written).toHaveLength(1);
  });

  // Phase 10: support messages go through the same port, so every kind is recorded and written
  // with the payload it was rendered from — the harness's `GET /e2e/support` reads it back.
  it("records and writes the support kinds with their payloads", async () => {
    const { sink, written } = arraySink();
    const email = makeEmailFake({ sink });
    const support = [
      {
        body: "It crashed.",
        kind: "bug-report",
        payload: { appVersion: "1.0.0 (1)", includeDiagnostics: "true" },
        subject: "Bug report",
        to: "support@notes.example",
      },
      {
        body: "Love it.",
        kind: "feedback",
        payload: { appVersion: "1.0.0 (1)" },
        subject: "Feedback",
        to: "support@notes.example",
      },
      {
        body: "Here is the link.",
        kind: "desktop-reminder",
        payload: { link: "https://notes.example/desktop" },
        subject: "Get Kothanote for Mac or Windows",
        to: "rita@example.test",
      },
    ] as const;

    for (const message of support) {
      await email.send(message);
    }

    expect(email.calls).toEqual(support);
    expect(written).toEqual(support);
  });
});
