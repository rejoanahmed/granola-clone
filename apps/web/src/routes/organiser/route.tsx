import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";

// A convenience, NOT the authorisation boundary: `EventsPolicy` on the server is the real answer,
// and every route underneath is enforced there regardless of what this guard does.
export const Route = createFileRoute("/organiser")({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({ search: { redirect: location.pathname }, to: "/login" });
    }
  },
  component: OrganiserLayout,
});

function OrganiserLayout() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="flex flex-wrap items-center gap-3 text-sm">
        <Link className="font-semibold" to="/organiser">
          Organiser
        </Link>
        <Link className="text-muted hover:text-ink" to="/organiser/events/new">
          New event
        </Link>
        <Link className="text-muted hover:text-ink" to="/organiser/scan">
          Gate check-in
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}
