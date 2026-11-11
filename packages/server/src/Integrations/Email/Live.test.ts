import { EmailUnavailable } from "@gc/domain/Email/Errors";
import { describe, expect, it } from "vitest";
import { makeEmailOff } from "./EmailOff";
import { makeResendClient, RESEND_URL } from "./ResendClient";

// D020: an owner server sends no mail; an owner who wants code sign-in brings a Resend key.

const MESSAGE = {
  body: "Your code is 123456.",
  kind: "otp",
  payload: { otp: "123456", type: "sign-in" },
  subject: "Your sign-in code",
  to: "rita@example.test",
} as const;

describe("EMAIL_MODE=off", () => {
  it("fails every send as EmailUnavailable, 503", async () => {
    const sent = makeEmailOff().send(MESSAGE);

    await expect(sent).rejects.toBeInstanceOf(EmailUnavailable);
    await expect(sent).rejects.toMatchObject({ status: 503 });
  });
});

describe("the Resend client", () => {
  it("posts the message from the configured sender with the key", async () => {
    const seen: {
      body: Record<string, unknown>;
      headers: Headers;
      url: string;
    }[] = [];
    const email = makeResendClient({
      apiKey: "re_test",
      fetch: (url, init) => {
        seen.push({
          body: JSON.parse(String(init?.body)),
          headers: new Headers(init?.headers),
          url: String(url),
        });
        return Promise.resolve(Response.json({ id: "x" }));
      },
      from: "Notes <notes@example.test>",
    });

    await email.send(MESSAGE);

    expect(seen[0]).toMatchObject({
      body: {
        from: "Notes <notes@example.test>",
        subject: MESSAGE.subject,
        text: MESSAGE.body,
        to: [MESSAGE.to],
      },
      url: RESEND_URL,
    });
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer re_test");
  });

  it("turns a refusal and a network failure into EmailUnavailable", async () => {
    const refused = makeResendClient({
      apiKey: "k",
      fetch: () => Promise.resolve(new Response("nope", { status: 403 })),
      from: "a@b.test",
    });
    const offline = makeResendClient({
      apiKey: "k",
      fetch: () => Promise.reject(new Error("offline")),
      from: "a@b.test",
    });

    await expect(refused.send(MESSAGE)).rejects.toBeInstanceOf(
      EmailUnavailable
    );
    await expect(offline.send(MESSAGE)).rejects.toBeInstanceOf(
      EmailUnavailable
    );
  });
});
