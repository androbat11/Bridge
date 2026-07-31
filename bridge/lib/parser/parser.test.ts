import { test, expect } from "bun:test";
import { buildDocument, parseBlock, parseDocument } from "./parser";

test("# Hi -> H1", () => {
  expect(parseDocument("# Hi")).toEqual([{ kind: "H1", text: "Hi" }]);
});

test("a document is a sequence of blocks, in source order", () => {
  expect(parseDocument("### Third\n# First\n")).toEqual([
    { kind: "H3", text: "Third" },
    { kind: "H1", text: "First" },
  ]);
});

test("an empty source is an empty document", () => {
  expect(parseDocument("")).toEqual([]);
  expect(parseDocument("\n\n")).toEqual([]);
});

test("parseBlock returns just the first block", () => {
  expect(parseBlock("## Only")).toEqual({ kind: "H2", text: "Only" });
  expect(parseBlock("nothing here")).toBeUndefined();
});

test("buildDocument is testable without any source text", () => {
  // The payoff of splitting lexing from AST building: this pass can be checked
  // against hand-written tokens, with no strings and no regexes involved.
  expect(buildDocument([{ kind: "H4", text: "Notes" }])).toEqual([
    { kind: "H4", text: "Notes" },
  ]);
});

test("parsing is pure: same input, same output, no shared state", () => {
  const first = parseDocument("# Hi");
  const second = parseDocument("# Hi");

  expect(first).toEqual(second);
  expect(first).not.toBe(second); // fresh array each call, nothing cached
});
