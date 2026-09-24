import { OTP_EXPIRES_IN_SECONDS } from "@gc/auth/otp";
import type { EmailPort } from "../Integrations/Email/Port";

export type AuthEmailsDeps = {
  readonly email: EmailPort;
};

export type OtpEmail = {
  readonly email: string;
  readonly otp: string;
  readonly type: string;
};

// Copy from docs/spec/phase-3.md §4. The expiry is computed from the value `createAuth` hands the
// plugin, so the minutes the email promises are the minutes the server allows.
const SUBJECT = "Your Notes sign-in code";
const EXPIRES_IN_MINUTES = OTP_EXPIRES_IN_SECONDS / 60;

const bodyFor = (otp: string): string =>
  `Your Notes code is ${otp}. It expires in ${EXPIRES_IN_MINUTES} minutes. If you didn’t ask for it, you can ignore this email.`;

// The auth mail this API sends, rendered in one place. better-auth decides *when* a code is sent;
// this decides what it says and hands it to whichever email provider the container chose.
export const makeAuthEmailsService = (deps: AuthEmailsDeps) => ({
  sendOtp: async ({ email, otp, type }: OtpEmail): Promise<void> => {
    await deps.email.send({
      body: bodyFor(otp),
      kind: "otp",
      payload: { otp, type },
      subject: SUBJECT,
      to: email,
    });
  },
});

export type AuthEmailsService = ReturnType<typeof makeAuthEmailsService>;
