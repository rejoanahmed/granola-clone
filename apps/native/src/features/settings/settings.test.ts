import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { userTypeLabel } from "../onboarding/userTypes";
import { deletionCopy } from "./deletion";
import { normaliseLinkedin, profileFieldPatch } from "./profile";
import { toggleMutation } from "./useSetting";
import { personalEmailProvider, workEmailBody } from "./workEmail";

// useSetting.ts reaches the API client and the toast at import time; only the pure mutation
// lifecycle is under test here.
vi.mock("@native/lib/api", () => ({
  keys: { settings: { me: () => ["settings", "me"] } },
  settingsQuery: () => ({}),
  useUpdateSetting: () => ({}),
}));
vi.mock("@native/design", () => ({ useToast: () => ({ show: () => 0 }) }));

// docs/spec/phase-10.md §11 Native task 2.
describe("profileFieldPatch", () => {
  it("refuses a blank name", () => {
    expect(profileFieldPatch("name", "   ", "E2E Person")).toEqual({
      error: "Your name can’t be empty.",
      kind: "invalid",
    });
  });

  it("sends a trimmed change and nothing for an unchanged value", () => {
    expect(profileFieldPatch("jobTitle", " Designer ", "Engineer")).toEqual({
      kind: "patch",
      patch: { jobTitle: "Designer" },
      value: "Designer",
    });
    expect(profileFieldPatch("jobTitle", "Engineer ", "Engineer").kind).toBe(
      "unchanged"
    );
  });

  it("clears an optional field with null", () => {
    expect(profileFieldPatch("companyName", "", "Acme")).toEqual({
      kind: "patch",
      patch: { companyName: null },
      value: "",
    });
  });

  it("validates LinkedIn after normalising a pasted URL", () => {
    expect(profileFieldPatch("linkedinUsername", "a b", null).kind).toBe(
      "invalid"
    );
    expect(
      profileFieldPatch(
        "linkedinUsername",
        "https://www.linkedin.com/in/e2e-person/",
        null
      )
    ).toEqual({
      kind: "patch",
      patch: { linkedinUsername: "e2e-person" },
      value: "e2e-person",
    });
  });
});

describe("normaliseLinkedin", () => {
  it("strips the prefix and a trailing slash", () => {
    expect(normaliseLinkedin(" linkedin.com/in/riley-park// ")).toBe(
      "riley-park"
    );
    expect(normaliseLinkedin("http://linkedin.com/in/x-y-z")).toBe("x-y-z");
    expect(normaliseLinkedin("riley")).toBe("riley");
  });
});

describe("personalEmailProvider and workEmailBody", () => {
  it("names the known personal providers", () => {
    expect(personalEmailProvider("a@gmail.com")).toBe("Gmail");
    expect(personalEmailProvider("a@GoogleMail.com")).toBe("Gmail");
    expect(personalEmailProvider("a@hotmail.com")).toBe("Outlook");
    expect(personalEmailProvider("a@live.com")).toBe("Outlook");
    expect(personalEmailProvider("a@me.com")).toBe("iCloud");
    expect(personalEmailProvider("a@yahoo.com")).toBe("Yahoo");
    expect(personalEmailProvider("e2e-person@gcnotes.test")).toBeNull();
    expect(personalEmailProvider("nobody")).toBeNull();
  });

  it("picks the body by provider", () => {
    expect(workEmailBody("a@icloud.com")).toContain("connected a iCloud");
    expect(workEmailBody("e2e-person@gcnotes.test")).toBe(
      "Sign up with the email you use for work to see your meetings in Notes."
    );
  });
});

describe("deletionCopy", () => {
  it("counts 0, 1 and many", () => {
    expect(deletionCopy(0)).toBe(
      "You have no notes, but your profile and settings will be removed. This can’t be undone."
    );
    expect(deletionCopy(1)).toBe("You’ll lose 1 note. This can’t be undone.");
    expect(deletionCopy(3)).toBe("You’ll lose 3 notes. This can’t be undone.");
  });
});

describe("userTypeLabel", () => {
  it("is null with no type, which Profile draws as Choose", () => {
    expect(userTypeLabel(null)).toBeNull();
    expect(userTypeLabel("investing")).toBe("Investing");
  });
});

describe("toggleMutation", () => {
  const key = ["settings", "me"];
  const saved = {
    chatDictationAutoSend: true,
    notifyUpcomingMeetings: true,
    useDataForTraining: true,
  };

  it("flips at once, then reverts and reports a failure", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key, saved);
    const onFailed = vi.fn();
    const options = toggleMutation({ onFailed, queryClient });
    const patch = { notifyUpcomingMeetings: false };
    const snapshot = await options.onMutate?.(patch, {} as never);
    expect(queryClient.getQueryData(key)).toEqual({
      ...saved,
      notifyUpcomingMeetings: false,
    });
    options.onError?.(new Error("offline"), patch, snapshot, {} as never);
    expect(queryClient.getQueryData(key)).toEqual(saved);
    expect(onFailed).toHaveBeenCalledOnce();
  });

  it("keeps the server's answer on success", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key, saved);
    const options = toggleMutation({ onFailed: vi.fn(), queryClient });
    const answer = { ...saved, useDataForTraining: false };
    options.onSuccess?.(
      answer,
      { useDataForTraining: false },
      { previous: saved },
      {} as never
    );
    expect(queryClient.getQueryData(key)).toEqual(answer);
  });
});
