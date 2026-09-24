import { formatPoisha } from "@evb/shared/money";
import { formatDhakaDateTime } from "@evb/shared/time";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { myRegistrationsQuery } from "@web/lib/api";
import { ALL_EVENTS } from "@web/lib/route-search";
import { cn } from "@web/lib/utils";

export const Route = createFileRoute("/me/registrations")({
  // `beforeLoad` runs before any fetch, so an anonymous visitor never sees a 401 flash.
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({ search: { redirect: location.pathname }, to: "/login" });
    }
  },
  component: MyRegistrations,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(myRegistrationsQuery()),
});

const STATUS_TONE: Record<string, string> = {
  cancelled: "text-muted",
  confirmed: "text-good",
  expired: "text-muted",
  pending: "text-warn",
  refunded: "text-muted",
};

function MyRegistrations() {
  const { data } = useQuery(myRegistrationsQuery());

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-semibold text-2xl">My tickets</h1>

      {data?.items.length === 0 && (
        <p className="mt-6 text-muted text-sm">
          Nothing yet.{" "}
          <Link className="underline" search={ALL_EVENTS} to="/">
            Browse events
          </Link>
          .
        </p>
      )}

      <ul className="mt-6 grid gap-3">
        {data?.items.map((registration) => (
          <li key={registration.id}>
            <Link
              className="evb-card flex items-center justify-between gap-4 hover:border-brand"
              params={{ registrationId: registration.id }}
              to="/registrations/$registrationId"
            >
              <span>
                <span className="block text-sm">
                  {formatDhakaDateTime(registration.createdAt)}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    STATUS_TONE[registration.status] ?? "text-muted"
                  )}
                >
                  {registration.status}
                </span>
              </span>
              <span className="font-medium text-sm">
                {formatPoisha(registration.totalPoisha)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
