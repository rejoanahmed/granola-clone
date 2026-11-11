import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privacyPage, renderMarkdown } from "@kn/shared/legal/markdown";
import { PRIVACY_MARKDOWN } from "@kn/shared/legal/privacy-source";
import { describe, expect, it } from "vitest";
import { app } from "../app";

// D029: every server serves the privacy policy at /privacy, from the one source file.

const SOURCE = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../docs/legal/PRIVACY.md"
  ),
  "utf8"
);

const env = {
  BETTER_AUTH_SECRET: "test-secret-not-used-by-these-routes",
  DB: {} as D1Database,
  NODE_ENV: "test",
} as const;

describe("the privacy policy page", () => {
  it("is generated from docs/legal/PRIVACY.md (run bun scripts/render-privacy.ts after editing it)", () => {
    expect(PRIVACY_MARKDOWN).toBe(SOURCE);
  });

  it("is served at /privacy as HTML to anyone", async () => {
    const response = await app.request("/privacy", {}, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("<h1>Privacy Policy</h1>");
    expect(html).toContain("We never receive your recordings");
    expect(html).toBe(privacyPage(SOURCE));
  });

  it("renders the subset the policy uses, escaping everything else", () => {
    expect(
      renderMarkdown(
        "# T\n\nA **b** `c` https://x.test/y.\n\n- one\n  more\n- two\n\n| A | B |\n| --- | --- |\n| 1 | <i> |"
      )
    ).toBe(
      '<h1>T</h1>\n<p>A <strong>b</strong> <code>c</code> <a href="https://x.test/y">https://x.test/y</a>.</p>\n<ul><li>one more</li><li>two</li></ul>\n<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>&lt;i&gt;</td></tr></tbody></table>'
    );
  });
});
