#!/usr/bin/env node
/**
 * The two import rules that carry the architecture cannot be expressed as lint rules, so they are
 * expressed here. Biome's `noRestrictedImports` covers a module by path; these four checks are
 * about *where a file sits* relative to the composition root, which no per-file rule can see.
 *
 * Without this script the table in docs/architecture/README.md §1 is a comment, and a comment
 * stops being true in about a month.
 *
 * Deliberately dependency-free (node:fs + node:path) and deliberately textual: a real parser buys
 * precision this does not need, at the cost of a build step in front of `bun run check`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".turbo",
  ".wrangler",
  ".expo",
  ".git",
]);

/** Posix-style repo-relative path, so the allowlists below read the same on every OS. */
const rel = (absolute) => relative(ROOT, absolute).split(sep).join("/");

const walk = (dir, out = []) => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // An area that has not been written yet is not a violation.
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walk(full, out);
      }
    } else if (
      /\.(ts|tsx|mts)$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
};

/**
 * Blank out comments and string bodies while preserving every line break, so a line number from a
 * match index is still the line number in the file. Scanning raw source would flag the rule text
 * quoted in a comment — including the comments in this repo that explain these very rules.
 */
const blankNonCode = (src) => {
  const out = src.split("");
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== "\n") {
        out[k] = " ";
      }
    }
  };
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const end = src.indexOf("\n", i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
    } else if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (src[i] === '"' || src[i] === "'" || src[i] === "`") {
      const quote = src[i];
      let j = i + 1;
      while (j < src.length && src[j] !== quote) {
        j += src[j] === "\\" ? 2 : 1;
      }
      // The specifier itself must survive: only the *inside* of a template literal is blanked,
      // because import paths are plain quoted strings this pass has to keep readable.
      if (quote === "`") {
        blank(i + 1, j);
      }
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out.join("");
};

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

const IMPORT_RE =
  /\bimport\s+(?:(type)\s+)?([\s\S]*?)from\s*["']([^"']+)["']|\bimport\s+["']([^"']+)["']/g;

/** Every import in a file: its specifier, its line, whether it is type-only. */
const importsOf = (code) => {
  const found = [];
  IMPORT_RE.lastIndex = 0;
  let match = IMPORT_RE.exec(code);
  while (match !== null) {
    const specifier = match[3] ?? match[4];
    const clause = match[2] ?? "";
    const typeOnly =
      match[1] === "type" ||
      // `import { type A, type B } from` erases at compile time exactly like `import type`.
      (/^\s*\{[\s\S]*\}\s*$/.test(clause) &&
        clause
          .replace(/[{}]/g, "")
          .split(",")
          .filter((part) => part.trim().length > 0)
          .every((part) => /^\s*type\s+/.test(part)));
    found.push({ line: lineOf(code, match.index), specifier, typeOnly });
    match = IMPORT_RE.exec(code);
  }
  return found;
};

const violations = [];
const report = (file, line, rule, detail) =>
  violations.push({ detail, file: rel(file), line, rule });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. R5 — Env is read in container.ts and Runtime/* only.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const ENV_RULE = "Env is read in container.ts and Runtime/* only (R5).";
const ENV_RE = /(?:^|[^\w$.])(?:process|c)\.env\b/;

const SERVER_SRC = join(ROOT, "packages", "server", "src");
const serverFiles = walk(SERVER_SRC);

for (const file of serverFiles) {
  const inServer = rel(file).slice("packages/server/src/".length);
  const exempt = inServer === "container.ts" || inServer.startsWith("Runtime/");
  if (exempt) {
    continue;
  }
  const code = blankNonCode(readFileSync(file, "utf8"));
  code.split("\n").forEach((text, index) => {
    if (ENV_RE.test(text)) {
      report(file, index + 1, ENV_RULE, text.trim());
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. R3 — a repository is constructed in container.ts, and taken as a dep everywhere else.
//    `import type { EventsRepo }` is legal anywhere; it is the *value* that must not spread.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const REPO_RULE =
  "Repositories are constructed in container.ts. Take the repo as a dep (R3).";
const REPO_SPECIFIER_RE = /(?:^|\/)\w+Repo(?:\.memory)?(?:\.ts)?$/;

for (const file of serverFiles) {
  const inServer = rel(file).slice("packages/server/src/".length);
  const exempt = inServer === "container.ts" || inServer.endsWith(".test.ts");
  if (exempt) {
    continue;
  }
  const code = blankNonCode(readFileSync(file, "utf8"));
  for (const imported of importsOf(code)) {
    if (imported.typeOnly) {
      continue;
    }
    if (REPO_SPECIFIER_RE.test(imported.specifier)) {
      report(
        file,
        imported.line,
        REPO_RULE,
        `value import of "${imported.specifier}"`
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. R3 — every field of every *Deps type is readonly. A mutable dep is a dep a method can
//    swap mid-request, which is the one thing the container cannot see.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const DEPS_RULE = "Deps are readonly (R3).";
const DEPS_RE = /type\s+(\w*Deps)\s*=\s*\{/g;
const FIELD_RE = /^\s*(readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*:/;

for (const file of serverFiles.filter((f) => f.endsWith("Service.ts"))) {
  const code = blankNonCode(readFileSync(file, "utf8"));
  DEPS_RE.lastIndex = 0;
  let match = DEPS_RE.exec(code);
  while (match !== null) {
    let depth = 1;
    let cursor = match.index + match[0].length;
    while (cursor < code.length && depth > 0) {
      if (code[cursor] === "{") {
        depth += 1;
      }
      if (code[cursor] === "}") {
        depth -= 1;
      }
      cursor += 1;
    }
    const body = code.slice(match.index + match[0].length, cursor - 1);
    const firstLine = lineOf(code, match.index + match[0].length);
    body.split("\n").forEach((text, index) => {
      const field = FIELD_RE.exec(text);
      if (field && !field[1]) {
        report(
          file,
          firstLine + index,
          DEPS_RULE,
          `${match[1]}.${field[2]} is not readonly`
        );
      }
    });
    match = DEPS_RE.exec(code);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. R2 — @evb/db appears only where SQL does. This is the half of §1's table that makes the
//    business logic database-free; Biome enforces it for services, this enforces it everywhere.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const DB_RULE =
  "@evb/db is imported by <Plural>Repo.ts and Runtime/Drizzle.ts only (R2).";
const DB_EXEMPT = (path) =>
  path.startsWith("packages/db/") ||
  path === "packages/auth/src/index.ts" ||
  path === "packages/server/src/Runtime/Drizzle.ts" ||
  /packages\/server\/src\/.*Repo\.ts$/.test(path);

const dbScanRoots = [join(ROOT, "packages"), join(ROOT, "apps")];
const dbFiles = dbScanRoots.flatMap((dir) => walk(dir));

for (const file of dbFiles) {
  const path = rel(file);
  if (DB_EXEMPT(path)) {
    continue;
  }
  const code = blankNonCode(readFileSync(file, "utf8"));
  for (const imported of importsOf(code)) {
    if (
      imported.specifier === "@evb/db" ||
      imported.specifier.startsWith("@evb/db/")
    ) {
      report(file, imported.line, DB_RULE, `imports "${imported.specifier}"`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

if (violations.length > 0) {
  const grouped = new Map();
  for (const v of violations) {
    grouped.set(v.rule, [...(grouped.get(v.rule) ?? []), v]);
  }
  for (const [rule, found] of grouped) {
    process.stderr.write(`\n${rule}\n`);
    for (const v of found) {
      process.stderr.write(`  ${v.file}:${v.line}  ${v.detail}\n`);
    }
  }
  process.stderr.write(
    `\ncheck-architecture: ${violations.length} violation(s). See docs/architecture/README.md §1.\n`
  );
  process.exit(1);
}

process.stdout.write(
  `check-architecture: ${serverFiles.length} file(s) in packages/server/src, ${dbFiles.length} in packages+apps. ` +
    "env scope, repo value imports, readonly Deps, @evb/db scope — all clean.\n"
);
