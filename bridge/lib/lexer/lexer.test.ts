import { test, expect } from "bun:test";
import {
  filterToken,
  heading,
  lexWith,
  mapToken,
  oneOf,
  regexTokenizer,
  tokenize,
  type Token,
  type Tokenizer,
} from "./texer";

const value = `# Bridge

## Overview

### Why this exists

#### Notes`;

// Annotated so `kind` stays the literal `"H1"` rather than widening to
// `string` — without the annotation TypeScript can't check this list against
// `Token` at all, and a typo like `"H5"` would slip through.
export const lexerExpectedOutput: Token[] = [
  { kind: "H1", text: "Bridge" },
  { kind: "H2", text: "Overview" },
  { kind: "H3", text: "Why this exists" },
  { kind: "H4", text: "Notes" },
];

const expectTokens = (src: string, expected: readonly Token[]) =>
  expect(tokenize(src)).toEqual(expected);

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

test("lexes one header of each level", () => {
  expect(tokenize(value)).toEqual(lexerExpectedOutput);
});

test("a header needs a space after the hashes", () => {
  // `#Title` is prose in Markdown, not a header — and prose isn't a rule in
  // grammar.cf yet, so nothing is emitted.
  expectTokens("#Title", []);
});

test("only four levels exist in the grammar", () => {
  expectTokens("##### Five", []);
  expectTokens("#### Four", [{ kind: "H4", text: "Four" }]);
});

test("longest marker wins (no maximal-munch bug)", () => {
  // If H1 were tried before H2, `## Overview` would wrongly lex as an H1 whose
  // text is `# Overview`.
  expectTokens("## Overview", [{ kind: "H2", text: "Overview" }]);
});

test("surrounding whitespace is not part of the text", () => {
  expectTokens("#   Padded   \n", [{ kind: "H1", text: "Padded" }]);
});

test("empty header text is allowed", () => {
  expectTokens("#\n", []); // no space -> not a header at all
  expectTokens("# \n", [{ kind: "H1", text: "" }]);
});

test("prose and blank lines are skipped for now", () => {
  // Lap 2 in docs/build-cycle.md (`Para . Block ::= Text ;`) is what changes
  // this expectation.
  expectTokens("# Title\n\nsome prose\n\n## Next", [
    { kind: "H1", text: "Title" },
    { kind: "H2", text: "Next" },
  ]);
});

test("CRLF input lexes the same as LF", () => {
  expectTokens("# One\r\n## Two\r\n", [
    { kind: "H1", text: "One" },
    { kind: "H2", text: "Two" },
  ]);
});

// ---------------------------------------------------------------------------
// The combinators — testable on their own, which is the real payoff
// ---------------------------------------------------------------------------

test("a tokenizer is just a function: call it directly", () => {
  expect(heading("## Two\nrest")).toEqual({
    raw: "## Two\n",
    token: { kind: "H2", text: "Two" },
  });
  expect(heading("not a header")).toBeUndefined();
});

test("oneOf tries alternatives in order and short-circuits", () => {
  const calls: string[] = [];
  const spy =
    (name: string, result: Tokenizer): Tokenizer =>
    (src) => {
      calls.push(name);
      return result(src);
    };

  const never: Tokenizer = () => undefined;
  const lexer = oneOf(spy("first", never), spy("second", heading));

  expect(lexer("# Hi")).toEqual({
    raw: "# Hi",
    token: { kind: "H1", text: "Hi" },
  });
  expect(calls).toEqual(["first", "second"]);

  // Once `heading` matched, nothing after it runs.
  calls.length = 0;
  oneOf(spy("first", heading), spy("second", never))("# Hi");
  expect(calls).toEqual(["first"]);
});

test("mapToken rewrites the token but not what was consumed", () => {
  const shouty = mapToken((token) => ({
    ...token,
    text: token.text.toUpperCase(),
  }));

  expect(shouty(heading)("# quiet\n")).toEqual({
    raw: "# quiet\n", // unchanged: raw is consumption bookkeeping
    token: { kind: "H1", text: "QUIET" },
  });
});

test("filterToken can reject a match the regex accepted", () => {
  const nonEmpty = filterToken((token) => token.text.length > 0);
  const lexer = lexWith(nonEmpty(heading));

  expect(lexer("# \n# Real\n")).toEqual([{ kind: "H1", text: "Real" }]);
});

test("lexWith works with any tokenizer, so custom rules need no new machinery", () => {
  // A deliberately silly rule: `!!! text` is an H1. Nothing in the driver knows
  // about headers, so this needs zero changes to texer.ts internals.
  const bang: Tokenizer = regexTokenizer(
    /^!!![ \t]+([^\n]*?)[ \t]*(?:\n|$)/,
    ([text]) => (text === undefined ? undefined : { kind: "H1", text }),
  );

  expect(lexWith(oneOf(heading, bang))("!!! Loud\n## Calm")).toEqual([
    { kind: "H1", text: "Loud" },
    { kind: "H2", text: "Calm" },
  ]);
});

test("a tokenizer that consumes nothing fails loudly instead of hanging", () => {
  const zeroWidth: Tokenizer = () => ({
    raw: "",
    token: { kind: "H1", text: "" },
  });

  expect(() => lexWith(zeroWidth)("# anything")).toThrow(/consumed no input/);
});
