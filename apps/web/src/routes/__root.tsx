import {
  createRootRoute,
  HeadContent,
  Link,
  Scripts,
} from "@tanstack/react-router";
import { SITE } from "@web/site";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";

const DESCRIPTION =
  "Private meeting notes that run on your own Cloudflare server. Record, transcribe in Bengali and English, and get notes nobody else can read.";

export const Route = createRootRoute({
  head: () => ({
    links: [
      { href: appCss, rel: "stylesheet" },
      { href: "/favicon.ico", rel: "icon", sizes: "32x32" },
      { href: "/icon.svg", rel: "icon", type: "image/svg+xml" },
      { href: "/apple-touch-icon.png", rel: "apple-touch-icon" },
      { href: "/site.webmanifest", rel: "manifest" },
    ],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: `${SITE.name}: private meeting notes on your own server` },
      { content: DESCRIPTION, name: "description" },
      { content: "#24262A", name: "theme-color" },
      { content: SITE.name, property: "og:site_name" },
      {
        content: `${SITE.name}: meeting notes that stay on your server`,
        property: "og:title",
      },
      { content: DESCRIPTION, property: "og:description" },
      { content: `${SITE.url}/og.png`, property: "og:image" },
      { content: "summary_large_image", name: "twitter:card" },
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto grid min-h-[60vh] max-w-xl place-content-center gap-4 px-5 text-center">
      <h1 className="font-serif text-4xl">Nothing here</h1>
      <Link className="text-accent-lime underline" to="/">
        Back to the start
      </Link>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
