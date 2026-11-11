import type {
  createBugReportRoute,
  createDesktopReminderRoute,
  createFeedbackRoute,
} from "@kn/domain/Support/Contract";
import type { Endpoint } from "./client";

// `import type` only, as in `profiles.ts`. None of these has anything to read back, so none
// invalidates a key.
export const makeSupportApi = (endpoint: Endpoint) => ({
  createBugReport: endpoint<typeof createBugReportRoute>(
    "post",
    "/support/bug-reports"
  ),
  createDesktopReminder: endpoint<typeof createDesktopReminderRoute>(
    "post",
    "/me/desktop-reminder"
  ),
  createFeedback: endpoint<typeof createFeedbackRoute>(
    "post",
    "/support/feedback"
  ),
});
