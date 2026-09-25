import { createRoute } from "@hono/zod-openapi";
import {
  BugReportCreate,
  FeedbackCreate,
  SupportReceipt,
} from "../Domain/Support";
import { commonErrors, ErrorBody, json, jsonBody } from "../Http";

// 202, not 201: the message is handed to the email provider, and nothing the caller can read back
// was created. The receipt id is ours, not the provider's.

const emailUnavailable = json(
  ErrorBody,
  "EmailUnavailable: the email provider could not take the message; try again shortly"
);

export const createBugReportRoute = createRoute({
  description:
    "Emails a bug report to support, signed with the caller's name and address. includeDiagnostics is recorded in the message; no logs are attached.",
  method: "post",
  path: "/support/bug-reports",
  request: { body: jsonBody(BugReportCreate) },
  responses: {
    202: json(SupportReceipt, "The report was handed to the email provider"),
    404: json(ErrorBody, "ProfileNotFound: the session outlived its user"),
    503: emailUnavailable,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Report a bug",
  tags: ["Support"],
});

export const createFeedbackRoute = createRoute({
  description:
    "Emails feedback to support, signed with the caller's name. It replaces a mailto: hand-off, so it goes through the same email port as everything else.",
  method: "post",
  path: "/support/feedback",
  request: { body: jsonBody(FeedbackCreate) },
  responses: {
    202: json(SupportReceipt, "The feedback was handed to the email provider"),
    404: json(ErrorBody, "ProfileNotFound: the session outlived its user"),
    503: emailUnavailable,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Send feedback",
  tags: ["Support"],
});

export const createDesktopReminderRoute = createRoute({
  description:
    "Emails the caller a link to the desktop app — “Remind me later”. It is an email, not a calendar or push reminder: email is the only outbound channel.",
  method: "post",
  path: "/me/desktop-reminder",
  responses: {
    202: json(SupportReceipt, "The reminder was handed to the email provider"),
    404: json(ErrorBody, "ProfileNotFound: the session outlived its user"),
    503: emailUnavailable,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Email me the desktop link",
  tags: ["Support"],
});
