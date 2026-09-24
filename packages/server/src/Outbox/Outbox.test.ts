import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDrizzle } from "../Runtime/Drizzle";
import { makeTestD1, seedD1, type TestD1 } from "../Testing";
import { makeOutboxRepo } from "./OutboxRepo";

const AT = 1_700_000_000_000;
const TO = "rita@example.test";

let d1: TestD1;

beforeEach(() => {
  d1 = makeTestD1();
});

afterEach(() => {
  d1.close();
});

const outboxRow = (id: string, payload: string, createdAt = AT) => ({
  body: "Your Notes code is 123456.",
  created_at: createdAt,
  id,
  kind: "otp",
  payload,
  recipient: TO,
  subject: "Your Notes sign-in code",
});

describe("OutboxRepo.latestOtpFor", () => {
  it("answers the newest code for the address", async () => {
    await seedD1(d1, [
      {
        rows: [
          outboxRow("eml_1", '{"otp":"111111","type":"sign-in"}'),
          outboxRow("eml_2", '{"otp":"222222","type":"sign-in"}', AT + 1),
        ],
        table: "email_outbox",
      },
    ]);

    await expect(
      makeOutboxRepo(makeDrizzle(d1)).latestOtpFor(TO)
    ).resolves.toEqual({
      email: TO,
      otp: "222222",
      sentAt: AT + 1,
      type: "sign-in",
    });
  });

  it("reads a payload that is not JSON, or not { otp, type }, as no code rather than throwing", async () => {
    const repo = makeOutboxRepo(makeDrizzle(d1));

    for (const payload of ["not json", "null", '{"otp":123456}']) {
      // biome-ignore lint/performance/noAwaitInLoops: one row at a time, each read on its own
      await d1.prepare("DELETE FROM email_outbox").run();
      await seedD1(d1, [
        { rows: [outboxRow("eml_bad", payload)], table: "email_outbox" },
      ]);
      await expect(repo.latestOtpFor(TO)).resolves.toBeNull();
    }
  });
});
