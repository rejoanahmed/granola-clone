import { describe, expect, it } from "vitest";
import { homeListState } from "./listState";

const settled = { error: null, isError: false, isPending: false, itemCount: 3 };
const gone = { _tag: "FolderNotFound" };

describe("homeListState", () => {
  it("is loading, then rows", () => {
    expect(homeListState({ ...settled, isPending: true }, null)).toBe(
      "loading"
    );
    expect(homeListState(settled, null)).toBe("rows");
    expect(homeListState(settled, "fld_1")).toBe("rows");
  });

  it("tells My notes' empty state from a folder's", () => {
    expect(homeListState({ ...settled, itemCount: 0 }, null)).toBe("empty");
    expect(homeListState({ ...settled, itemCount: 0 }, "fld_1")).toBe(
      "folderEmpty"
    );
  });

  it("is folderGone on FolderNotFound, even with a page cached", () => {
    expect(
      homeListState({ ...settled, error: gone, isError: true }, "fld_1")
    ).toBe("folderGone");
    expect(
      homeListState(
        { ...settled, error: gone, isError: true, itemCount: 0 },
        "fld_1"
      )
    ).toBe("folderGone");
  });

  it("is error only with nothing to show", () => {
    const failed = { ...settled, error: new Error("x"), isError: true };
    expect(homeListState({ ...failed, itemCount: 0 }, "fld_1")).toBe("error");
    expect(homeListState(failed, "fld_1")).toBe("rows");
    expect(homeListState({ ...failed, itemCount: 0 }, null)).toBe("error");
  });
});
