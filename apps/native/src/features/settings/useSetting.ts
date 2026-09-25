import { useToast } from "@native/design";
import {
  keys,
  type SettingsMutationOptions,
  type SettingsPatch,
  settingsQuery,
  type UserSettings,
  useUpdateSetting,
} from "@native/lib/api";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { SETTINGS_COPY } from "./copy";

export type SettingKey = keyof UserSettings;
type Snapshot = { readonly previous: UserSettings | undefined };

// docs/spec/phase-10.md §3 "Saving a toggle": flip at once, send the one key, and on failure put
// the cached document back and say so. The server's answer is written straight into the cache
// rather than invalidated, so a slow refetch can never flip a switch back mid-animation.
export function toggleMutation({
  onFailed,
  queryClient,
}: {
  readonly onFailed: () => void;
  readonly queryClient: QueryClient;
}): SettingsMutationOptions<Snapshot> {
  const key = keys.settings.me();
  return {
    onError: (_error, _patch, snapshot) => {
      if (snapshot?.previous) {
        queryClient.setQueryData(key, snapshot.previous);
      }
      onFailed();
    },
    onMutate: async (patch: SettingsPatch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserSettings>(key);
      if (previous) {
        queryClient.setQueryData<UserSettings>(key, { ...previous, ...patch });
      }
      return { previous };
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(key, settings);
    },
  };
}

export type SettingState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly retry: () => void }
  | {
      readonly status: "ready";
      /** In flight: the toggle is disabled so fast double taps cannot race. */
      readonly saving: boolean;
      readonly toggle: () => void;
      readonly value: boolean;
    };

export function useSetting(key: SettingKey): SettingState {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery(settingsQuery());
  const mutation = useUpdateSetting(
    toggleMutation({
      onFailed: () => toast.show({ message: SETTINGS_COPY.toggle.saveError }),
      queryClient,
    })
  );
  if (query.data) {
    const value = query.data[key];
    return {
      saving: mutation.isPending,
      status: "ready",
      toggle: () => {
        if (!mutation.isPending) {
          mutation.mutate({ [key]: !value });
        }
      },
      value,
    };
  }
  if (query.isError) {
    return { retry: () => query.refetch(), status: "error" };
  }
  return { status: "loading" };
}
