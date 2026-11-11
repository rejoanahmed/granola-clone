import { eq, user, userSettings } from "@kn/db";
import type { UserId } from "@kn/domain/Domain/Ids";
import type {
  UserSettings,
  UserSettingsPatch,
} from "@kn/domain/Domain/Settings";
import type { Timestamp } from "@kn/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";
import { unlessUserGone } from "../Runtime/ForeignKey";

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

// `null` when the user row itself is gone; `saved: null` when the user has never saved a setting.
// The two differ to the caller (a 404 against the defaults), so they are not collapsed here.
export type SettingsRead = { readonly saved: UserSettings | null };

export const makeSettingsRepo = (db: DrizzleClient) => ({
  // From `user`, left-joined, so one read tells "never saved" from "account gone".
  byUser: async (userId: UserId): Promise<SettingsRead | null> => {
    const row = await db
      .select({
        chatDictationAutoSend: userSettings.chatDictationAutoSend,
        notifyUpcomingMeetings: userSettings.notifyUpcomingMeetings,
        useDataForTraining: userSettings.useDataForTraining,
      })
      .from(user)
      .leftJoin(userSettings, eq(userSettings.userId, user.id))
      .where(eq(user.id, userId))
      .get();
    if (row === undefined) {
      return null;
    }
    const {
      chatDictationAutoSend,
      notifyUpcomingMeetings,
      useDataForTraining,
    } = row;
    if (
      chatDictationAutoSend === null ||
      notifyUpcomingMeetings === null ||
      useDataForTraining === null
    ) {
      return { saved: null };
    }
    return {
      saved: {
        chatDictationAutoSend,
        notifyUpcomingMeetings,
        useDataForTraining,
      },
    };
  },

  // One statement. The insert carries the full row (the caller's base merged with the patch), and
  // the conflict branch sets only the patched columns — so two concurrent patches of different
  // keys both land, where a read-merge-write would let the later one undo the earlier. `false` when
  // the user row is gone (see `unlessUserGone`).
  upsert: (
    userId: UserId,
    base: UserSettings,
    patch: UserSettingsPatch,
    now: Timestamp
  ): Promise<boolean> => {
    const patched = patchedColumnsOf(patch);
    return unlessUserGone(
      db
        .insert(userSettings)
        .values({ ...base, ...patched, updatedAt: now, userId })
        .onConflictDoUpdate({
          set: { ...patched, updatedAt: now },
          target: userSettings.userId,
        })
        .run()
    );
  },
});

export type SettingsRepo = ReturnType<typeof makeSettingsRepo>;
