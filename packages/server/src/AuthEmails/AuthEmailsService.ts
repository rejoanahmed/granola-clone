import type { EmailPort } from "../Integrations/Email/Port";

export type AuthEmailsDeps = {
  readonly email: EmailPort;
  /**
   * The value `createAuth` hands the plugin, passed in by `container.ts` from `@kn/auth/otp` so
   * the minutes the email promises are the minutes the server allows.
   */
  readonly otpExpiresInSeconds: number;
};

export type OtpEmail = {
  readonly email: string;
  readonly otp: string;
  readonly type: string;
};

// Copy from docs/spec/phase-3.md §4.
const SUBJECT = "Your Kothanote sign-in code";
const SECONDS_PER_MINUTE = 60;

const bodyFor = (otp: string, expiresInMinutes: number): string =>
  `Your Kothanote code is ${otp}. It expires in ${expiresInMinutes} minutes. If you didn’t ask for it, you can ignore this email.`;

// The auth mail this API sends, rendered in one place. better-auth decides *when* a code is sent;
// this decides what it says and hands it to whichever email provider the container chose.
export const makeAuthEmailsService = (deps: AuthEmailsDeps) => ({
  sendOtp: async ({ email, otp, type }: OtpEmail): Promise<void> => {
    await deps.email.send({
      body: bodyFor(otp, deps.otpExpiresInSeconds / SECONDS_PER_MINUTE),
      kind: "otp",
      payload: { otp, type },
      subject: SUBJECT,
      to: email,
    });
  },
});

export type AuthEmailsService = ReturnType<typeof makeAuthEmailsService>;
