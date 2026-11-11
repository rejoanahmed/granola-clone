import { renderMarkdown } from "@kn/shared/legal/markdown";
import { PRIVACY_MARKDOWN } from "@kn/shared/legal/privacy-source";
import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@web/components/chrome";
import { SITE } from "@web/site";

// The same policy every self-hosted server serves at /privacy (D029), from docs/legal/PRIVACY.md.
// The markup is the renderer's, which escapes everything first, so the HTML set here is safe.
export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: `Privacy policy · ${SITE.name}` },
      {
        content: `How ${SITE.name} handles your data: it never reaches us.`,
        name: "description",
      },
    ],
  }),
});

const POLICY_HTML = renderMarkdown(PRIVACY_MARKDOWN);

function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-14">
        <article
          className="legal"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown escapes its input
          dangerouslySetInnerHTML={{ __html: POLICY_HTML }}
        />
      </main>
      <SiteFooter />
    </>
  );
}
