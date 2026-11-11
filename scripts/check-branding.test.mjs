// docs/spec/phase-12.md §7.2, §9.1: the product name never reaches the app's source, config, flows or
// asset names. The scanner is handed the tracked file list and a reader, so these cases need no git
// and no disk.
import { describe, expect, it } from "bun:test";
import { findBrandingLeaks } from "./lib/branding.mjs";

/** A reader over an in-memory tree; a path it does not hold is an error, as an unread file would be. */
const readerOf = (files) => (path) => {
  if (!(path in files)) {
    throw new Error(`the scanner read ${path}, which the test did not expect`);
  }
  return files[path];
};

const scan = (files, tracked = Object.keys(files)) =>
  findBrandingLeaks(tracked, readerOf(files));

describe("findBrandingLeaks", () => {
  it("passes on a file list with no match", () => {
    expect(
      scan({
        "apps/native/.maestro/phase-4/open-note.yaml":
          "- tapOn:\n    id: note-more\n",
        "apps/native/app.json": '{ "expo": { "name": "Notes" } }',
        "apps/native/src/x.ts": 'export const name = "Notes";\n',
        "packages/server/src/Notes/NotesService.ts": "export {};\n",
      })
    ).toEqual([]);
  });

  it("fails on a source file naming the product, with its path and line", () => {
    const errors = scan({
      "apps/native/src/x.ts": 'const a = 1;\nexport const name = "Granola";\n',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("apps/native/src/x.ts:2");
  });

  it("matches without regard to case", () => {
    const errors = scan({
      "apps/api/src/a.ts": "// GRANOLA\n",
      "packages/domain/src/b.ts": "// granola\n",
    });
    expect(errors).toHaveLength(2);
    expect(errors.join("\n")).toContain("apps/api/src/a.ts:1");
    expect(errors.join("\n")).toContain("packages/domain/src/b.ts:1");
  });

  it("covers app.json, app.config.ts and the Maestro flows", () => {
    const errors = scan({
      "apps/native/.maestro/phase-2/x.yaml": "name: Granola home\n",
      "apps/native/app.config.ts": "export default { name: 'granola' };\n",
      "apps/native/app.json": '{ "expo": { "name": "Granola" } }',
    });
    expect(errors).toHaveLength(3);
  });

  it("ignores docs, which describe the discovery source by name", () => {
    expect(
      scan({ "docs/spec/phase-2.md": "55 captured screens of Granola iOS\n" })
    ).toEqual([]);
  });

  it("ignores untracked paths such as node_modules, reading only what it is given", () => {
    const files = {
      "apps/native/src/x.ts": "export {};\n",
      "node_modules/granola/index.js": "module.exports = 'Granola';\n",
    };
    expect(scan(files, ["apps/native/src/x.ts"])).toEqual([]);
  });

  it("fails on an asset named for the product, whatever its bytes", () => {
    const errors = findBrandingLeaks(
      ["apps/native/assets/granola-logo.png", "apps/native/assets/icon.png"],
      () => {
        throw new Error("an asset's bytes are never read");
      }
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("apps/native/assets/granola-logo.png");
  });
});
