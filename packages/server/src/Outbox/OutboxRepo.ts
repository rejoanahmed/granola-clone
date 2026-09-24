import { and, desc, emailOutbox, eq, sql } from "@gc/db";
import type { Timestamp } from "@gc/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";

// The row as this repo writes it, declared here rather than borrowed from the email port: a repo
// knows the table, not the integration. An `EmailMessage` plus a stamp and an id is one of these
// by shape, which is all `container.ts` relies on.
export type OutboxEntry = {
  readonly body: string;
  readonly createdAt: Timestamp;
  readonly id: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, string>>;
  readonly subject: string;
  readonly to: string;
};

export type LatestOtp = {
  readonly email: string;
  readonly otp: string;
  readonly sentAt: Timestamp;
  readonly type: string;
};

// The column has no shape guarantee (a hand edit, a future kind written under "otp"), so anything
// that is not `{ otp, type }` reads as "no code" rather than failing the harness with a 500.
const otpPayloadOf = (raw: string): { otp: string; type: string } | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const { otp, type } = parsed as Record<string, unknown>;
  return typeof otp === "string" && typeof type === "string"
    ? { otp, type }
    : null;
};

// The fake email provider's mailbox. Dev-only by construction: `AppConfig` refuses to boot
// production with `EMAIL_MODE=fake`, so nothing in production ever writes a plaintext code here.
export const makeOutboxRepo = (db: DrizzleClient) => ({
  append: async (entry: OutboxEntry): Promise<void> => {
    await db
      .insert(emailOutbox)
      .values({
        body: entry.body,
        createdAt: entry.createdAt,
        id: entry.id,
        kind: entry.kind,
        payload: JSON.stringify(entry.payload),
        recipient: entry.to,
        subject: entry.subject,
      })
      .run();
  },

  // Newest first, with `rowid` breaking a same-millisecond tie: a resend inside one clock tick must
  // still hand back the code that works, since better-auth has already replaced the older one.
  latestOtpFor: async (recipient: string): Promise<LatestOtp | null> => {
    const row = await db
      .select({
        createdAt: emailOutbox.createdAt,
        payload: emailOutbox.payload,
        recipient: emailOutbox.recipient,
      })
      .from(emailOutbox)
      .where(
        and(eq(emailOutbox.recipient, recipient), eq(emailOutbox.kind, "otp"))
      )
      .orderBy(desc(emailOutbox.createdAt), desc(sql`rowid`))
      .limit(1)
      .get();
    if (row === undefined) {
      return null;
    }
    const payload = otpPayloadOf(row.payload);
    if (payload === null) {
      return null;
    }
    return {
      email: row.recipient,
      otp: payload.otp,
      sentAt: row.createdAt,
      type: payload.type,
    };
  },
});

export type OutboxRepo = ReturnType<typeof makeOutboxRepo>;
