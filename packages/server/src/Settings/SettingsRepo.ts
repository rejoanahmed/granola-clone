import { eq, userSettings } from "@gc/db";
import type { UserId } from "@gc/domain/Domain/Ids";
import type {
  UserSettings,
  UserSettingsPatch,
} from "@gc/domain/Domain/Settings";
import type { Timestamp } from "@gc/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";

// Only the keys the patch carries. Written out rather than spread, so a key the patch gains is a
// decision here and not a column written by accident.
const patchedColumnsOf = (patch: UserSettingsPatch) =>
  Object.fromEntries(
    Object.entries({
      chatDictationAutoSend: patch.chatDictationAutoSend,
      notifyUpcomingMeetings: patch.notifyUpcomingMeetings,
      useDataForTraining: patch.useDataForTraining,
    }).filter(([, value]) => value !== undefined)
  );

export const makeSettingsRepo = (db: DrizzleClient) => ({
  byUser: async (userId: UserId): Promise<UserSettings | null> => {
    const row = await db
      .select({
        chatDictationAutoSend: userSettings.chatDictationAutoSend,
        notifyUpcomingMeetings: userSettings.notifyUpcomingMeetings,
        useDataForTraining: userSettings.useDataForTraining,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .get();
    return row ?? null;
  },

  // One statement. The insert carries the full row (the caller's base merged with the patch), and
  // the conflict branch sets only the patched columns — so two concurrent patches of different
  // keys both land, where a read-merge-write would let the later one undo the earlier.
  upsert: async (
    userId: UserId,
    base: UserSettings,
    patch: UserSettingsPatch,
    now: Timestamp
  ): Promise<void> => {
    const patched = patchedColumnsOf(patch);
    await db
      .insert(userSettings)
      .values({ ...base, ...patched, updatedAt: now, userId })
      .onConflictDoUpdate({
        set: { ...patched, updatedAt: now },
        target: userSettings.userId,
      })
      .run();
  },
});

export type SettingsRepo = ReturnType<typeof makeSettingsRepo>;
