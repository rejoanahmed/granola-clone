// The site is served at rovierr.com/kothanote, not at a domain of its own (D035). The router
// takes this as its basepath, and every built and public file physically lives under it
// (`public/kothanote/`, `assetsDir`), because the Worker's asset handler matches the request path
// to a file path before any code runs: a `vite base` alone would emit `/kothanote/assets/…` URLs
// for files uploaded at `/assets/…`.
export const BASE_PATH = "/kothanote";
