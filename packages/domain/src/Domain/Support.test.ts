import { describe, expect, it } from "vitest";
// @ts-expect-error phase 10: the settings shapes are specified (phase-10.md §6.2, §11 API 1), not built
import * as Settings from "./Settings";
// @ts-expect-error phase 10: the support shapes are specified (phase-10.md §6.2, §11 API 1), not built
import * as Support from "./Support";

// docs/spec/phase-10.md §6.2 and §7 case 16. The contract is the only thing between a support form
// and an email to a person, so a blank message, an oversized one and a stray key are refused here,
// before any service is reached. The settings patch is strict for the same reason: a key the table
// does not have must be a 422, not a silently ignored write.

const VERSION = "1.0.0 (1)";

describe("BugReportCreate", () => {
  const valid = {
    appVersion: VERSION,
    includeDiagnostics: true,
    message: "Steps: tapped Share twice",
  };

  it("accepts a report and trims its message", () => {
    expect(
      Support.BugReportCreate.parse({ ...valid, message: "  Steps: x  " })
    ).toEqual({ ...valid, message: "Steps: x" });
  });

  it("rejects a whitespace-only message", () => {
    expect(
      Support.BugReportCreate.safeParse({ ...valid, message: "   " }).success
    ).toBe(false);
  });

  it("rejects a message over SUPPORT_MESSAGE_MAX (5000), and takes one at it", () => {
    expect(Support.SUPPORT_MESSAGE_MAX).toBe(5000);
    expect(
      Support.BugReportCreate.safeParse({
        ...valid,
        message: "x".repeat(5001),
      }).success
    ).toBe(false);
    expect(
      Support.BugReportCreate.safeParse({
        ...valid,
        message: "x".repeat(5000),
      }).success
    ).toBe(true);
  });

  it("rejects a report with no includeDiagnostics", () => {
    const { includeDiagnostics: _, ...missing } = valid;
    expect(Support.BugReportCreate.safeParse(missing).success).toBe(false);
  });

  it("rejects an extra key (strict object)", () => {
    expect(
      Support.BugReportCreate.safeParse({ ...valid, logs: "…" }).success
    ).toBe(false);
  });

  it("rejects a blank appVersion", () => {
    expect(
      Support.BugReportCreate.safeParse({ ...valid, appVersion: " " }).success
    ).toBe(false);
  });
});

describe("FeedbackCreate", () => {
  it("accepts a message and an app version, trimmed", () => {
    expect(
      Support.FeedbackCreate.parse({
        appVersion: VERSION,
        message: " Love the search ",
      })
    ).toEqual({ appVersion: VERSION, message: "Love the search" });
  });

  it("rejects includeDiagnostics, which only a bug report carries", () => {
    expect(
      Support.FeedbackCreate.safeParse({
        appVersion: VERSION,
        includeDiagnostics: true,
        message: "Love the search",
      }).success
    ).toBe(false);
  });
});

describe("the support constants", () => {
  it("addresses support@notes.example", () => {
    expect(Support.SUPPORT_ADDRESS).toBe("support@notes.example");
  });

  it("parses a receipt with a non-empty id", () => {
    expect(Support.SupportReceipt.safeParse({ id: "sup_1" }).success).toBe(
      true
    );
    expect(Support.SupportReceipt.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("UserSettingsPatch", () => {
  it("accepts any subset of the three booleans, {} included", () => {
    expect(Settings.UserSettingsPatch.parse({})).toEqual({});
    expect(
      Settings.UserSettingsPatch.parse({ notifyUpcomingMeetings: false })
    ).toEqual({ notifyUpcomingMeetings: false });
  });

  it("rejects a non-boolean value", () => {
    expect(
      Settings.UserSettingsPatch.safeParse({ notifyUpcomingMeetings: "no" })
        .success
    ).toBe(false);
  });

  it("rejects an unknown key (strict object)", () => {
    expect(Settings.UserSettingsPatch.safeParse({ extra: true }).success).toBe(
      false
    );
  });

  it("defaults every setting to on, as discovery observed them", () => {
    expect(Settings.SETTINGS_DEFAULTS).toEqual({
      chatDictationAutoSend: true,
      notifyUpcomingMeetings: true,
      useDataForTraining: true,
    });
    expect(
      Settings.UserSettings.safeParse(Settings.SETTINGS_DEFAULTS).success
    ).toBe(true);
  });
});
