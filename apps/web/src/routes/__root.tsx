import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  type QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Scripts,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { authClient } from "@web/lib/auth-client";
import { ALL_EVENTS, NO_REDIRECT } from "@web/lib/route-search";
import {
  getUserSession,
  SESSION_QUERY_KEY,
  type UserSession,
} from "@web/services/auth";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

// Anything else that wants to be global belongs in a query: a context value cannot be invalidated,
// which is why a session held in React context goes stale after sign-out.
export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  session?: UserSession | null;
}>()({
  // `ensureQueryData` resolves from cache when the entry is fresh, so `/organiser/*` does not pay
  // a session round trip per navigation; sign-in and sign-out evict the key to force a refetch.
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData({
      queryFn: () => getUserSession(),
      queryKey: SESSION_QUERY_KEY,
    });
    return { session };
  },
  head: () => ({
    links: [
      { href: appCss, rel: "stylesheet" },
      { href: "/favicon.ico", rel: "icon", type: "image/x-icon" },
      { href: "/site.webmanifest", rel: "manifest" },
    ],
    meta: [
      { charSet: "utf-8" },
      {
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
        name: "viewport",
      },
      { title: "eventsbd" },
      {
        content: "Find events in Bangladesh, hold a seat, pay with bKash.",
        name: "description",
      },
    ],
  }),
  shellComponent: RootDocument,
});

const SiteHeader = () => {
  const { session } = useRouteContext({ from: "__root__" });
  const router = useRouter();
  const queryClient = useQueryClient();

  // Evict the cached session BEFORE `router.invalidate()`: that re-runs the root `beforeLoad`,
  // whose `ensureQueryData` would answer from the still-fresh entry and keep the user signed in.
  const signOut = async () => {
    await authClient.signOut();
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    await router.invalidate();
    await router.navigate({ search: ALL_EVENTS, to: "/" });
  };

  return (
    <header className="border-line border-b bg-raised">
      <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 py-3 text-sm">
        <Link className="font-semibold text-base" search={ALL_EVENTS} to="/">
          eventsbd
        </Link>
        <Link className="text-muted hover:text-ink" search={ALL_EVENTS} to="/">
          Events
        </Link>
        {session ? (
          <>
            <Link className="text-muted hover:text-ink" to="/me/registrations">
              My tickets
            </Link>
            <Link className="text-muted hover:text-ink" to="/organiser">
              Organiser
            </Link>
            <span className="ml-auto text-muted">{session.user.email}</span>
            <button className="evb-button" onClick={signOut} type="button">
              Sign out
            </button>
          </>
        ) : (
          <Link className="evb-button ml-auto" search={NO_REDIRECT} to="/login">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
};

// TanStack Start hands the matched route tree in as `children`, which is why there is no `<Outlet />`.
function RootDocument({ children }: { readonly children: ReactNode }) {
  const { queryClient } = useRouteContext({ from: "__root__" });

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <SiteHeader />
          {children}
          <Toaster position="top-right" richColors />
          {import.meta.env.DEV ? (
            <TanStackDevtools
              plugins={[
                { name: "Router", render: <TanStackRouterDevtoolsPanel /> },
                { name: "Query", render: <ReactQueryDevtoolsPanel /> },
              ]}
            />
          ) : null}
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
