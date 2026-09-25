import { z } from "zod";

// Three switches from #81, #85 and #86. None controls anything yet (BLOCKERS.md): they are stored
// and read back so the phase that gives them meaning only reads them and never migrates them.
export const UserSettings = z.object({
  chatDictationAutoSend: z.boolean(),
  notifyUpcomingMeetings: z.boolean(),
  useDataForTraining: z.boolean(),
});
export type UserSettings = z.infer<typeof UserSettings>;

// DATA-MODEL.md: discovery observed all three on. A user with no stored row reads these, and
// reading never writes one — so the defaults must live here, not only in a column default.
export const SETTINGS_DEFAULTS: UserSettings = {
  chatDictationAutoSend: true,
  notifyUpcomingMeetings: true,
  useDataForTraining: true,
};

// Strict, so a key the table does not have is a 422 rather than a write silently dropped. An
// absent key means "untouched", which is what lets two toggles patched at once both land.
export const UserSettingsPatch = z.strictObject({
  chatDictationAutoSend: z.boolean().optional(),
  notifyUpcomingMeetings: z.boolean().optional(),
  useDataForTraining: z.boolean().optional(),
});
export type UserSettingsPatch = z.infer<typeof UserSettingsPatch>;
