// `unit.legal-markdown` — what a legal body is allowed to be (L-009 `3b`).
//
// The parser is the reason the unit's promise holds: `3a`'s ratified text lands as version 2 of the same rows
// and no page changes. So the cases here are not the seed's shape, they are the shape a real policy has —
// numbered sections as headings, bullet lists, horizontal rules, bold lead-ins mid-paragraph — driven against
// the same code the draft goes through today.
//
// The last case is the deliberate non-feature: an unsupported construct arrives as visible characters rather
// than being silently swallowed. A half-parser that ate a table would publish a policy with a clause missing
// and nothing to see; literal pipes are ugly and get noticed.
import { describe, expect, it } from "vitest";
import { parseMarkdownBlocks } from "./parse-markdown-blocks";

describe("unit.legal-markdown — a legal body's blocks", () => {
  it("reads the three heading levels", () => {
    expect(parseMarkdownBlocks("# A\n\n## B\n\n### C")).toEqual([
      { kind: "heading", level: 1, text: "A" },
      { kind: "heading", level: 2, text: "B" },
      { kind: "heading", level: 3, text: "C" },
    ]);
  });

  it("joins wrapped lines into one paragraph and splits on the blank line", () => {
    expect(parseMarkdownBlocks("one\ntwo\n\nthree")).toEqual([
      { kind: "paragraph", text: "one two" },
      { kind: "paragraph", text: "three" },
    ]);
  });

  it("gathers consecutive bullets into one list, either marker", () => {
    expect(parseMarkdownBlocks("- a\n* b\n\n- c")).toEqual([
      { kind: "list", items: ["a", "b"] },
      { kind: "list", items: ["c"] },
    ]);
  });

  it("ends a paragraph when a list starts, and the other way round", () => {
    expect(parseMarkdownBlocks("lead\n- a\ntail")).toEqual([
      { kind: "paragraph", text: "lead" },
      { kind: "list", items: ["a"] },
      { kind: "paragraph", text: "tail" },
    ]);
  });

  it("reads a horizontal rule and does not mistake it for a bullet", () => {
    expect(parseMarkdownBlocks("a\n\n---\n\nb")).toEqual([
      { kind: "paragraph", text: "a" },
      { kind: "rule" },
      { kind: "paragraph", text: "b" },
    ]);
  });

  it("keeps an unsupported construct visible rather than swallowing it", () => {
    expect(parseMarkdownBlocks("| a | b |")).toEqual([
      { kind: "paragraph", text: "| a | b |" },
    ]);
  });

  it("answers nothing for an empty body", () => {
    expect(parseMarkdownBlocks("   \n\n  ")).toEqual([]);
  });
});
