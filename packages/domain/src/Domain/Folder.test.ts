import { describe, expect, it } from "vitest";
// @ts-expect-error phase 9: the folder shapes are specified (phase-9.md §6.2, §11 API 1), not built
import * as Folder from "./Folder";
import * as Ids from "./Ids";

// docs/spec/phase-9.md §6.2 and §7 case 10. `folderNameKey` is what uniqueness and the drawer's order
// compare, so "Product" and " product " must clash; `FolderName` is what the create sheet caps at.

describe("folderNameKey", () => {
  it("trims, collapses inner whitespace to one space, and lower-cases", () => {
    expect(Folder.folderNameKey("  Product \t  Ideas ")).toBe("product ideas");
    expect(Folder.folderNameKey("PRODUCT")).toBe("product");
    expect(Folder.folderNameKey(" product ")).toBe(
      Folder.folderNameKey("Product")
    );
  });

  it("lower-cases beyond ASCII, so “Élan” and “élan” are one name", () => {
    expect(Folder.folderNameKey("Élan")).toBe("élan");
    expect(Folder.folderNameKey("ÉLAN")).toBe(Folder.folderNameKey("élan"));
  });
});

describe("FolderName", () => {
  it("trims the name it accepts", () => {
    expect(Folder.FolderName.parse("  Research ")).toBe("Research");
  });

  it("rejects a blank name and one over FOLDER_NAME_MAX (60)", () => {
    expect(Folder.FOLDER_NAME_MAX).toBe(60);
    expect(Folder.FolderName.safeParse("   ").success).toBe(false);
    expect(Folder.FolderName.safeParse("x".repeat(61)).success).toBe(false);
    expect(Folder.FolderName.safeParse("x".repeat(60)).success).toBe(true);
  });
});

describe("the folder shapes", () => {
  it("caps an owner at FOLDERS_PER_OWNER_MAX (100) folders", () => {
    expect(Folder.FOLDERS_PER_OWNER_MAX).toBe(100);
  });

  it("brands FolderId with the fld_ prefix, next to NoteId in Ids.ts", () => {
    const ids = Ids as unknown as Record<
      string,
      { safeParse: (v: unknown) => unknown }
    >;
    const FolderId = ids.FolderId;

    expect(FolderId).toBeDefined();
    expect(FolderId?.safeParse("fld_e2e_personal")).toMatchObject({
      success: true,
    });
    expect(FolderId?.safeParse("not_e2e_launch")).toMatchObject({
      success: false,
    });
  });

  it("refuses an extra key on FolderCreate and FolderNoteAdd", () => {
    expect(
      Folder.FolderCreate.safeParse({ extra: 1, name: "Research" }).success
    ).toBe(false);
    expect(
      Folder.FolderNoteAdd.safeParse({ extra: 1, noteId: "not_e2e_launch" })
        .success
    ).toBe(false);
    expect(
      Folder.FolderNoteAdd.safeParse({ noteId: "not_e2e_launch" }).success
    ).toBe(true);
  });

  it("parses a Folder with a non-negative noteCount", () => {
    const folder = {
      createdAt: 1,
      id: "fld_e2e_personal",
      name: "Personal",
      noteCount: 1,
      updatedAt: 1,
    };

    expect(Folder.Folder.safeParse(folder).success).toBe(true);
    expect(Folder.Folder.safeParse({ ...folder, noteCount: -1 }).success).toBe(
      false
    );
    expect(Folder.FolderList.safeParse({ items: [folder] }).success).toBe(true);
  });
});
