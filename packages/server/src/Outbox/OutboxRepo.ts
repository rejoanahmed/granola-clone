import { and, desc, emailOutbox, eq, sql } from "@gc/db";
import type { Timestamp } from "@gc/domain/Domain/Time";
import { z } from "zod";
import type { EmailMessage } from "../Integrations/Email/Port";
import type { DrizzleClient } from "../Runtime/Drizzle";

export type OutboxEntry = EmailMessage & {
  readonly createdAt: Timestamp;
  readonly id: string;
};

export type LatestOtp = {
  readonly email: string;
  readonly otp: string;
  readonly sentAt: Timestamp;
  readonly type: string;
};

const OtpPayload = z.object({ otp: z.string(), type: z.string() });

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
    const payload = OtpPayload.safeParse(JSON.parse(row.payload));
    if (!payload.success) {
      return null;
    }
    return {
      email: row.recipient,
      otp: payload.data.otp,
      sentAt: row.createdAt,
      type: payload.data.type,
    };
  },
});

export type OutboxRepo = ReturnType<typeof makeOutboxRepo>;
