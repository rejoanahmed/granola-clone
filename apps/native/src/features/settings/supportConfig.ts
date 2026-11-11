// The two support forms (docs/spec/phase-10.md §3.8, §3.9): one component, two configs.
export type SupportVariant = "bug" | "feedback";

export type SupportConfig = {
  readonly diagnostics: boolean;
  readonly error: string;
  readonly placeholder: string;
  readonly prefix: "feedback" | "report-bug";
  readonly prompt: string;
  readonly section: string;
  readonly sent: string;
  readonly title: string;
};

export const SUPPORT_CONFIG: Record<SupportVariant, SupportConfig> = {
  bug: {
    diagnostics: true,
    error: "Couldn’t send your report. Try again.",
    placeholder: "Steps:\n\nExpected:\n\nActual:\n\nAttempts to fix:",
    prefix: "report-bug",
    prompt:
      "What steps led to this bug, and what happened versus what you expected?",
    section: "Describe the bug",
    sent: "Thanks — your report was sent.",
    title: "Report a bug",
  },
  feedback: {
    diagnostics: false,
    error: "Couldn’t send your feedback. Try again.",
    placeholder: "Write your feedback here...",
    prefix: "feedback",
    prompt: "What’s working, what isn’t, and what would you like to see?",
    section: "Your feedback",
    sent: "Thanks for your feedback.",
    title: "Send feedback",
  },
};

export const DIAGNOSTICS_COPY = {
  hint: "Shares up to 7 days of logs with the Kothanote team to help us debug faster. This doesn’t include your transcript or notes.",
  label: "Include recent app diagnostics",
  section: "Diagnostics",
} as const;
