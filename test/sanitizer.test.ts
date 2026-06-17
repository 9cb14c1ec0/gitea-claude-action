import { describe, expect, test } from "bun:test";
import {
  sanitizeContent,
  stripHtmlComments,
  stripInvisibleCharacters,
} from "../src/gitea/sanitizer";

describe("sanitizeContent", () => {
  test("removes HTML comments", () => {
    expect(stripHtmlComments("a<!-- secret -->b")).toBe("ab");
  });

  test("removes zero-width and bidi control characters", () => {
    const zwsp = String.fromCharCode(0x200b);
    const bidi = String.fromCharCode(0x202e);
    const dirty = `hi${zwsp}there${bidi}more`;
    expect(stripInvisibleCharacters(dirty)).toBe("hitheremore");
  });

  test("strips markdown image alt text", () => {
    expect(sanitizeContent("![evil instructions](http://x/y.png)")).toBe(
      "![](http://x/y.png)",
    );
  });

  test("passes through ordinary text", () => {
    expect(sanitizeContent("normal **markdown** text")).toBe(
      "normal **markdown** text",
    );
  });

  test("handles empty input", () => {
    expect(sanitizeContent("")).toBe("");
  });
});
