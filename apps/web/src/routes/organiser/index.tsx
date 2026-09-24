import { formatDhakaDateTime } from "@gc/shared/time";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { myEventsQuery } from "@web/lib/api";
import { cn } from "@web/lib/utils";

// A draft is invisible to the public feed even to its own author, so an organiser reads their own
// list through this endpoint rather than `GET /events`.
export const Route = createFileRoute("/organiser/")({
  component: OrganiserEvents,
  loader: ({ context }) => context.queryClient.ensureQueryData(myEventsQuery()),
});

const STATUS_TONE: Record<string, string> = {
  cancelled: "text-bad",
  draft: "text-muted",
  published: "text-good",
};

function OrganiserEvents() {
  const { data } = useQuery(myEventsQuery());

  return (
    <section className="mt-6">
      <h1 className="font-semibold text-2xl">Your events</h1>

      {data?.items.length === 0 && (
        <p className="mt-4 text-muted text-sm">
          No events yet.{" "}
          <Link className="underline" to="/organiser/events/new">
            Create the first one
          </Link>
          .
        </p>
      )}

      <ul className="mt-4 grid gap-3">
        {data?.items.map((event) => (
          <li key={event.id}>
            <Link
              className="evb-card flex items-center justify-between gap-4 hover:border-brand"
              params={{ eventId: event.id }}
              to="/organiser/events/$eventId"
            >
              <span>
                <span className="block font-medium text-sm">{event.title}</span>
                <span className="text-muted text-xs">
                  {formatDhakaDateTime(event.startsAt)} · {event.city}
                </span>
              </span>
              <span
                className={cn(
                  "text-xs",
                  STATUS_TONE[event.status] ?? "text-muted"
                )}
              >
                {event.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
