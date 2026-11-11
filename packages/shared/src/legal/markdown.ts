// The privacy policy is written once, in docs/legal/PRIVACY.md, and served by every server at
// /privacy (D029). This renders the small Markdown subset that file uses: `#`/`##` headings,
// paragraphs, `-` lists, pipe tables, **bold**, `code` and bare https links. Everything is escaped
// first, so the page cannot carry markup the file did not mean.

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const inline = (text: string): string =>
  escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(https:\/\/[^\s)<]+[^\s)<.,])/g, '<a href="$1">$1</a>');

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

const DIVIDER = /^\|?\s*:?-{3,}/;

export const renderMarkdown = (source: string): string => {
  const out: string[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      out.push(`<h${level}>${inline(heading[2] ?? "")}</h${level}>`);
      index += 1;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[] = [];
      while (index < lines.length && (lines[index] ?? "").startsWith("|")) {
        rows.push(lines[index] ?? "");
        index += 1;
      }
      const [head, ...rest] = rows;
      const body = rest.filter((row) => !DIVIDER.test(row));
      out.push(
        `<table><thead><tr>${cells(head ?? "")
          .map((c) => `<th>${inline(c)}</th>`)
          .join("")}</tr></thead><tbody>${body
          .map(
            (row) =>
              `<tr>${cells(row)
                .map((c) => `<td>${inline(c)}</td>`)
                .join("")}</tr>`
          )
          .join("")}</tbody></table>`
      );
      continue;
    }
    if (/^- /.test(line)) {
      const items: string[] = [];
      while (
        index < lines.length &&
        /^(- |\s{2,}\S)/.test(lines[index] ?? "")
      ) {
        const current = lines[index] ?? "";
        if (current.startsWith("- ")) {
          items.push(current.slice(2));
        } else {
          items[items.length - 1] = `${items.at(-1) ?? ""} ${current.trim()}`;
        }
        index += 1;
      }
      out.push(
        `<ul>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`
      );
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() !== "" &&
      !/^(#{1,3}\s|- |\|)/.test(lines[index] ?? "")
    ) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    out.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return out.join("\n");
};

const STYLE = `body{margin:0;background:#24262A;color:#F7F9FB;font:17px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 20px 64px}h1{font:400 34px/1.2 Georgia,serif}
h2{margin-top:2em;font-size:21px}h3{margin-top:1.6em;font-size:18px}a{color:#5CC8AA}code{font-size:15px}
table{border-collapse:collapse;width:100%;font-size:15px;margin:1em 0}th,td{border:1px solid #313438;padding:8px;text-align:left;vertical-align:top}
th{color:#A4A9AF;font-weight:600}`;

export const privacyPage = (source: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy</title><style>${STYLE}</style></head><body><main>${renderMarkdown(source)}</main></body></html>`;
