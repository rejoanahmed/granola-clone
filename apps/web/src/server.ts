import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { BASE_PATH } from "./base-path";

const CANONICAL_ORIGIN = "https://rovierr.com";

// The site's first address was this Worker's workers.dev host, and links to it are out there (D033).
// It folds into rovierr.com/kothanote, the one canonical URL, the way www.rovierr.com folds into
// the apex. Only pages reach this: the asset handler answers file requests before any code runs.
export default createServerEntry({
  fetch(request, options) {
    const url = new URL(request.url);
    if (url.hostname.endsWith(".workers.dev")) {
      const path =
        url.pathname === BASE_PATH || url.pathname.startsWith(`${BASE_PATH}/`)
          ? url.pathname
          : `${BASE_PATH}${url.pathname === "/" ? "/" : url.pathname}`;
      return Response.redirect(`${CANONICAL_ORIGIN}${path}${url.search}`, 301);
    }
    return handler.fetch(request, options);
  },
});
