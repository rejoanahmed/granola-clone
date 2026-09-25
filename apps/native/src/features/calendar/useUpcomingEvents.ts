import { upcomingEventsQuery } from "@native/lib/api";
import { useAuth } from "@native/lib/auth-provider";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { endOfTomorrow } from "./eventTime";

export const UPCOMING_REFRESH_MS = 60_000;

/**
 * Home's meetings (docs/spec/phase-11.md §3.3). The interval runs only while home is focused, and
 * each tick also moves `now`, so the Now badge and "Tomorrow" follow the clock when the data has not
 * changed. `until` is recomputed from that `now`, so the key moves once a day, at midnight.
 */
export function useUpcomingEvents() {
  const { session } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  const [focused, setFocused] = useState(true);
  const until = endOfTomorrow(now);
  const query = useQuery({
    ...upcomingEventsQuery(until),
    enabled: session != null,
    refetchInterval: focused ? UPCOMING_REFRESH_MS : false,
    retry: 1,
  });

  const { refetch } = query;
  // The mount's own fetch is the first focus's; refetching over it would cancel it and start again.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setNow(Date.now());
      if (firstFocus.current) {
        firstFocus.current = false;
      } else if (session != null) {
        refetch().catch(() => undefined);
      }
      return () => setFocused(false);
    }, [refetch, session])
  );

  useEffect(() => {
    if (!focused) {
      return;
    }
    const tick = setInterval(() => setNow(Date.now()), UPCOMING_REFRESH_MS);
    return () => clearInterval(tick);
  }, [focused]);

  return { now, query };
}
