import { createFileRoute, redirect } from "@tanstack/react-router";
import { SITE } from "@web/site";

// A stable address for the setup guide. The iPhone app links here, not to GitHub, so the guide can
// move (or become a page of this site) without an app release.
export const Route = createFileRoute("/self-hosting")({
  beforeLoad: () => {
    throw redirect({ href: SITE.selfHosting });
  },
});
