import { BD_DIVISIONS } from "@gc/shared/bd";
import { formatDhakaDateTime } from "@gc/shared/time";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { publishedEventsQuery } from "@web/lib/api";
import type { FeedSearch } from "@web/lib/route-search";

// `loaderDeps` names the search params the loader reads; without it the loader is not re-run when
// the city changes. It precedes `loader` because TypeScript resolves one object literal's generics
// in source order, and with `loader` first `deps` widens to `{}`.
// biome-ignore assist/source/useSortedKeys: loaderDeps must precede loader — see above
export const Route = createFileRoute("/")({
  component: EventFeed,
  loaderDeps: ({ search }): FeedSearch => ({
    city: search.city,
    cursor: search.cursor,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      publishedEventsQuery({ city: deps.city, cursor: deps.cursor })
    ),
  validateSearch: (search: Record<string, unknown>): FeedSearch => ({
    city: typeof search.city === "string" && search.city ? search.city : null,
    cursor:
      typeof search.cursor === "string" && search.cursor ? search.cursor : null,
  }),
});

function EventFeed() {
  const { city, cursor } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data, isPending } = useQuery(publishedEventsQuery({ city, cursor }));

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-semibold text-2xl">Events</h1>
      <p className="mt-1 text-muted text-sm">
        Published events, soonest first. Hold a seat and pay with bKash.
      </p>

      <form className="mt-6 flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">City</span>
          <select
            className="evb-field"
            defaultValue={city ?? ""}
            name="city"
            // Changing the city resets the cursor: a cursor is only meaningful within the query
            // that produced it.
            onChange={(event) =>
              navigate({
                search: {
                  city: event.currentTarget.value || null,
                  cursor: null,
                },
              })
            }
          >
            <option value="">Anywhere</option>
            {BD_DIVISIONS.map((division) => (
              <option key={division} value={division}>
                {division}
              </option>
            ))}
          </select>
        </label>
      </form>

      {isPending ? <p className="mt-8 text-muted text-sm">Loading…</p> : null}

      {data && data.items.length === 0 && (
        <p className="mt-8 text-muted text-sm">
          Nothing published here yet.{" "}
          <Link className="underline" to="/organiser/events/new">
            Create an event
          </Link>
          .
        </p>
      )}

      <ul className="mt-6 grid gap-3">
        {data?.items.map((event) => (
          <li key={event.id}>
            <Link
              className="evb-card block hover:border-brand"
              params={{ eventId: event.id }}
              to="/events/$eventId"
            >
              <h2 className="font-medium">{event.title}</h2>
              <p className="mt-1 text-muted text-sm">
                {formatDhakaDateTime(event.startsAt)} · {event.venue},{" "}
                {event.city}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {data?.nextCursor != null && (
        <Link
          className="evb-button mt-6"
          search={{ city, cursor: data.nextCursor }}
          to="/"
        >
          Next page
        </Link>
      )}
    </main>
  );
}
