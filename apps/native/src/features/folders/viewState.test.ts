import { describe, expect, it } from "vitest";
import { folderRowLabel, formatNoteCount } from "./copy";
import {
  addToFolderState,
  errorTag,
  filterFolders,
  folderCreateError,
} from "./viewState";

const base = {
  failed: false,
  folderCount: 2,
  matchCount: 2,
  query: "",
  ready: true,
};

describe("addToFolderState", () => {
  it("is loading until both queries have data, and error if one failed", () => {
    expect(addToFolderState({ ...base, ready: false })).toBe("loading");
    expect(addToFolderState({ ...base, failed: true, ready: false })).toBe(
      "error"
    );
  });

  it("keeps drawing the list when a refetch fails with data in hand", () => {
    expect(addToFolderState({ ...base, failed: true })).toBe("list");
  });

  it("is the #17 empty state only with no folders and no query", () => {
    expect(addToFolderState({ ...base, folderCount: 0, matchCount: 0 })).toBe(
      "empty"
    );
  });

  it("is No results for any typed query that matches nothing (#18)", () => {
    expect(
      addToFolderState({ ...base, folderCount: 0, matchCount: 0, query: "pro" })
    ).toBe("noResults");
    expect(addToFolderState({ ...base, matchCount: 0, query: "zz" })).toBe(
      "noResults"
    );
  });

  it("treats a whitespace query as empty", () => {
    expect(addToFolderState({ ...base, matchCount: 0, query: "  " })).toBe(
      "list"
    );
  });
});

describe("folderCreateError", () => {
  it("names the trimmed name on FolderNameTaken", () => {
    expect(folderCreateError({ _tag: "FolderNameTaken" }, " research ")).toBe(
      "You already have a folder called “research”."
    );
  });

  it("says the limit on FolderLimitReached", () => {
    expect(folderCreateError({ _tag: "FolderLimitReached" }, "x")).toBe(
      "You’ve reached the limit of 100 folders."
    );
  });

  it("falls back to the generic line", () => {
    expect(folderCreateError(new Error("boom"), "x")).toBe(
      "Couldn’t create this folder. Try again."
    );
    expect(errorTag(null)).toBeNull();
  });
});

describe("filterFolders", () => {
  const folders = [{ name: "Personal" }, { name: "Product" }, { name: "Élan" }];

  it("keeps everything for an empty query", () => {
    expect(filterFolders(folders, " ")).toBe(folders);
  });

  it("matches a case-insensitive substring in the list's order", () => {
    expect(filterFolders(folders, "P").map((f) => f.name)).toEqual([
      "Personal",
      "Product",
    ]);
    expect(filterFolders(folders, " pro ").map((f) => f.name)).toEqual([
      "Product",
    ]);
    expect(filterFolders(folders, "élan").map((f) => f.name)).toEqual(["Élan"]);
  });
});

describe("formatNoteCount and folderRowLabel", () => {
  it("counts notes", () => {
    expect(formatNoteCount(0)).toBe("No notes");
    expect(formatNoteCount(1)).toBe("1 note");
    expect(formatNoteCount(12)).toBe("12 notes");
  });

  it("labels a row, with added on the sheet", () => {
    expect(folderRowLabel("Product", 2)).toBe("Product, 2 notes");
    expect(folderRowLabel("Product", 2, true)).toBe("Product, 2 notes, added");
  });
});
