import { MutationCache, QueryClient } from "@tanstack/react-query";
import {
  createRouter as createTanStackRouter,
  ErrorComponent,
} from "@tanstack/react-router";
import { NotFoundComponent } from "@web/components/not-found";
import { queryDefaults } from "@web/lib/api";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";

// A factory, not a module constant: a `QueryClient` at module scope would be shared by every
// concurrent SSR request, so one visitor's cached registration would answer another's query.
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // This API's errors are business answers, not blips: retrying a 409 `SoldOut` only
        // delays the message.
        retry: 0,
        staleTime: queryDefaults.staleTimeMs,
      },
    },
    // One global toast for mutation errors; a route that renders the failure inline opts out with
    // `meta: { inlineError: true }`.
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.inlineError === true) {
          return;
        }
        toast.error(
          error instanceof Error ? error.message : "Something went wrong"
        );
      },
    }),
  });

  return createTanStackRouter({
    context: { queryClient },
    defaultErrorComponent: ErrorComponent,
    defaultNotFoundComponent: NotFoundComponent,
    // Prefetch on hover/focus. Cheap here because every loader is a cached query.
    defaultPreload: "intent",
    routeTree,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: module augmentation needs an interface
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

declare module "@tanstack/react-query" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: module augmentation needs an interface
  interface Register {
    mutationMeta: { readonly inlineError?: boolean };
  }
}
