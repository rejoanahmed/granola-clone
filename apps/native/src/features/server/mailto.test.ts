import { describe, expect, it } from "vitest";
import { mailtoUrl } from "./mailto";

describe("mailtoUrl", () => {
  it("encodes the subject and a body with reserved characters and newlines", () => {
    expect(
      mailtoUrl(
        "kothanote@rovierr.com",
        "Bug report (1.0.0 (1))",
        "a & b?\nনতুন"
      )
    ).toBe(
      "mailto:kothanote@rovierr.com?subject=Bug%20report%20(1.0.0%20(1))&body=a%20%26%20b%3F%0A%E0%A6%A8%E0%A6%A4%E0%A7%81%E0%A6%A8"
    );
  });
});
