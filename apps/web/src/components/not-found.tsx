import { Link } from "@tanstack/react-router";
import { ALL_EVENTS } from "@web/lib/route-search";

export const NotFoundComponent = () => (
  <main className="mx-auto flex max-w-2xl flex-col items-start gap-3 px-4 py-16">
    <p className="font-mono text-6xl text-muted">404</p>
    <h1 className="font-semibold text-2xl">No such page</h1>
    <p className="text-muted text-sm">
      The link may be stale, or the event may have been unpublished.
    </p>
    <Link className="evb-button" search={ALL_EVENTS} to="/">
      Back to events
    </Link>
  </main>
);
