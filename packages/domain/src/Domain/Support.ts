import { z } from "zod";

export const SUPPORT_MESSAGE_MAX = 5000;
export const SUPPORT_ADDRESS = "support@notes.example";

// Trimmed before the length check, so a message of spaces is empty rather than sent to a person.
const SupportMessage = z.string().trim().min(1).max(SUPPORT_MESSAGE_MAX);
// "1.0.0 (1)" — the client's own label, echoed into the subject line. A pattern, not just a length:
// the value lands in an email header, and a CR/LF in it is header injection once the fake port is
// replaced by a real provider.
const APP_VERSION_PATTERN = /^[\w .()+-]+$/;
const AppVersion = z.string().trim().min(1).max(40).regex(APP_VERSION_PATTERN);

// Strict: a client that believes it is attaching logs must hear a 422, not have them dropped.
export const BugReportCreate = z.strictObject({
  appVersion: AppVersion,
  includeDiagnostics: z.boolean(),
  message: SupportMessage,
});
export type BugReportCreate = z.infer<typeof BugReportCreate>;

export const FeedbackCreate = z.strictObject({
  appVersion: AppVersion,
  message: SupportMessage,
});
export type FeedbackCreate = z.infer<typeof FeedbackCreate>;

// The service mints the id (`sup_…`); the outbox keeps its own, so the fake never reaches the wire.
export const SupportReceipt = z.object({ id: z.string().min(1) });
export type SupportReceipt = z.infer<typeof SupportReceipt>;
