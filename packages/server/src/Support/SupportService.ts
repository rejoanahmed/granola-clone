import type { Profile } from "@gc/domain/Domain/Profile";
import {
  type BugReportCreate,
  type FeedbackCreate,
  SUPPORT_ADDRESS,
  type SupportReceipt,
} from "@gc/domain/Domain/Support";
import { ProfileNotFound } from "@gc/domain/Profile/Errors";
import type { Actor } from "../Auth/Actor";
import type { EmailMessage, EmailPort } from "../Integrations/Email/Port";
import type { ProfilesRepo } from "../Profiles/ProfilesRepo";
import type { Ids } from "../Runtime/Ids";
import { canSendSupport } from "./Policy";

export const DESKTOP_LINK = "https://notes.example/desktop";

export type SupportDeps = {
  readonly email: EmailPort;
  readonly ids: Ids;
  // Only the sender's name and address, for the subject and the signature.
  readonly profiles: Pick<ProfilesRepo, "byId">;
};

type Sender = Pick<Profile, "email" | "name">;

// Pure, and exported so the copy (spec §4) is testable without a port. The message is trimmed
// here as well as by the contract: the service is callable without the HTTP layer (R6).
export const renderBugReport = (
  sender: Sender,
  input: BugReportCreate
): EmailMessage => ({
  body: [
    input.message.trim(),
    "",
    input.includeDiagnostics
      ? "Diagnostics: included"
      : "Diagnostics: not included",
    `From: ${sender.name} ${sender.email}`,
  ].join("\n"),
  kind: "bug-report",
  payload: {
    appVersion: input.appVersion,
    from: sender.email,
    includeDiagnostics: String(input.includeDiagnostics),
  },
  subject: `Bug report from Notes ${input.appVersion} | ${sender.email}`,
  to: SUPPORT_ADDRESS,
});

export const renderFeedback = (
  sender: Sender,
  input: FeedbackCreate
): EmailMessage => ({
  body: `${input.message.trim()}\n\nSincerely,\n${sender.name}`,
  kind: "feedback",
  payload: { appVersion: input.appVersion, from: sender.email },
  subject: `Feedback on Notes ${input.appVersion} | ${sender.email}`,
  to: SUPPORT_ADDRESS,
});

export const renderDesktopReminder = (sender: Sender): EmailMessage => ({
  body: `Here’s the link you asked for. Open it on your computer to download Notes: ${DESKTOP_LINK}`,
  kind: "desktop-reminder",
  payload: { link: DESKTOP_LINK },
  subject: "Get Notes for Mac or Windows",
  to: sender.email,
});

export const makeSupportService = (deps: SupportDeps) => {
  // A live session whose user row is gone is `ProfileNotFound`, as on `GET /me`; nothing is sent.
  const sender = async (actor: Actor): Promise<Sender> => {
    const profile = await deps.profiles.byId(actor.id);
    if (profile === null) {
      throw new ProfileNotFound({ id: actor.id });
    }
    return canSendSupport(profile, actor);
  };

  // The receipt id is minted here and carried in the payload, rather than being the outbox row's
  // id: that id belongs to the fake, and returning it would leak the fake through the port.
  // `EmailUnavailable` propagates untouched and maps to a 503.
  const send = async (message: EmailMessage): Promise<SupportReceipt> => {
    const id = deps.ids.generate("sup_");
    await deps.email.send({
      ...message,
      payload: { ...message.payload, receiptId: id },
    });
    return { id };
  };

  return {
    createBugReport: async (
      actor: Actor,
      input: BugReportCreate
    ): Promise<SupportReceipt> =>
      send(renderBugReport(await sender(actor), input)),

    createDesktopReminder: async (actor: Actor): Promise<SupportReceipt> =>
      send(renderDesktopReminder(await sender(actor))),

    createFeedback: async (
      actor: Actor,
      input: FeedbackCreate
    ): Promise<SupportReceipt> =>
      send(renderFeedback(await sender(actor), input)),
  };
};

export type SupportService = ReturnType<typeof makeSupportService>;
