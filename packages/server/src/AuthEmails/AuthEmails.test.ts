import { describe, expect, it } from "vitest";
// @ts-expect-error phase 3: the fake is specified (phase-3.md §6.5), not built
import { makeEmailFake } from "../Integrations/Email/EmailFake";
// @ts-expect-error phase 3: the service is specified (phase-3.md §6.5), not built
import { makeAuthEmailsService } from "./AuthEmailsService";

// The copy is phase-3.md §4's, verbatim: the expiry it promises is `createAuth`'s 300 seconds, and
// a subject that drifted would be the only sign a user had that the code came from us.

const SUBJECT = "Your Notes sign-in code";
const BODY =
  "Your Notes code is 482913. It expires in 5 minutes. If you didn’t ask for it, you can ignore this email.";

describe("AuthEmailsService.sendOtp", () => {
  // §7 case 18
  it("sends §4's subject and body to the address, as an otp with the code in its payload", async () => {
    const email = makeEmailFake({ sink: () => Promise.resolve() });
    const authEmails = makeAuthEmailsService({ email });

    await authEmails.sendOtp({
      email: "rita@example.test",
      otp: "482913",
      type: "sign-in",
    });

    expect(email.calls).toEqual([
      {
        body: BODY,
        kind: "otp",
        payload: { otp: "482913", type: "sign-in" },
        subject: SUBJECT,
        to: "rita@example.test",
      },
    ]);
  });
});
