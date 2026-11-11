import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// A factory, as the publisher's other web app has it: nothing here is per request yet, but the
// shape is the one TanStack Start calls.
export function getRouter() {
  return createTanStackRouter({
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
