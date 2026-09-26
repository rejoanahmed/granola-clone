// docs/spec/phase-12.md §7.2. Walks `git ls-files`, so untracked and ignored files are never read.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findBrandingLeaks } from "./lib/branding.mjs";

const ROOT = resolve(import.meta.dirname, "..");

const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: ROOT,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const errors = findBrandingLeaks(tracked, (path) =>
  readFileSync(resolve(ROOT, path), "utf8")
);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`check-branding: ${error}`);
  }
  process.exit(1);
}
console.log("check-branding: ok");
