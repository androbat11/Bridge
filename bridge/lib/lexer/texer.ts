// Bridge — the LEXER (step 3a of docs/build-cycle.md), built from functions.
//
// The one idea in this file:
//
//     a tokenizer IS a function     (src: string) => Match | undefined
//
// Not a class, not a config object with a `tokenize` method — a plain function.
// Everything else follows from that, because functions compose: `oneOf` takes
// tokenizers and returns a tokenizer, `mapToken` decorates a tokenizer and
// returns a tokenizer. Combining them never produces a new *kind* of thing, so
// there's never a second API to learn.
//
// Follow that thread far enough and you arrive at parser combinators, which is
// how real functional parsing libraries are built. See
// docs/functional-parsing.md §8 for the walk from here to there.
//
// Shape originally inspired by tiptap's custom-tokenizer docs:
// https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-tokenizer

import { flow, unfold, type Step } from "../core/fp";

// ---------------------------------------------------------------------------
// The types (design the types first — the functions then almost write themselves)
// ---------------------------------------------------------------------------

// One variant per labelled rule in ../grammar.cf. For a header-only language
// the tokens happen to look just like the AST nodes in ../types/parser.ts; they
// stop being identical the moment a rule captures something other than flat
// text (lap 3, inline `*italic*`, is where they diverge).
export type Token =
  | { readonly kind: "H1"; readonly text: string }
  | { readonly kind: "H2"; readonly text: string }
  | { readonly kind: "H3"; readonly text: string }
  | { readonly kind: "H4"; readonly text: string };

export type TokenKind = Token["kind"];

// What a tokenizer hands back on success: the token, plus the exact slice of
// source it consumed. Keeping `raw` *outside* the token is what lets the lexer
// advance without every AST node carrying bookkeeping fields around.
export type Match = {
  readonly raw: string;
  readonly token: Token;
};

// A tokenizer looks at the front of `src` and answers "is there something I
// recognize here?". `undefined` means "not mine" — never an exception, never a
// mutated cursor. Total functions with no hidden state are what make the
// combinators below possible.
export type Tokenizer = (src: string) => Match | undefined;

// ---------------------------------------------------------------------------
// Combinators — functions that build tokenizers out of tokenizers
// ---------------------------------------------------------------------------

// A tokenizer from a regex plus a function that turns the match into a token.
// `build` returns `undefined` to reject a match the regex accepted, which keeps
// the pattern simple and the decision in TypeScript.
//
// This is a *factory*: it takes data and returns behaviour. Most of the
// duplication in a hand-written lexer disappears the moment you write one.
export const regexTokenizer =
  (
    pattern: RegExp,
    build: (groups: readonly (string | undefined)[]) => Token | undefined,
  ): Tokenizer =>
  (src) => {
    const match = pattern.exec(src);
    if (!match) return undefined;

    const token = build(match.slice(1));
    if (!token) return undefined;

    // match[0] is the whole matched text: exactly what was consumed.
    return { raw: match[0], token };
  };

// Alternation: try each tokenizer in order, first match wins. This is the
// functional spelling of "a Block is one of four things" from grammar.cf.
//
// The `for` loop inside is an implementation detail; what matters is that the
// *interface* is a Tokenizer, so `oneOf(a, oneOf(b, c))` is a Tokenizer too.
// Purity is about the boundary, not about banning loops.
export const oneOf =
  (...tokenizers: readonly Tokenizer[]): Tokenizer =>
  (src) => {
    for (const tokenizer of tokenizers) {
      const match = tokenizer(src);
      if (match) return match; // short-circuits — later tokenizers never run
    }
    return undefined;
  };

// Post-process the token a tokenizer produced, leaving `raw` (and so the
// consumption bookkeeping) untouched. `map` on a container you built yourself:
// once a type has a `map`, it starts composing with everything.
export const mapToken =
  (f: (token: Token) => Token) =>
  (tokenizer: Tokenizer): Tokenizer =>
  (src) => {
    const match = tokenizer(src);
    return match ? { ...match, token: f(match.token) } : undefined;
  };

// Reject matches whose token fails a predicate — useful for rules a regex can
// express but shouldn't (e.g. "no empty headers").
export const filterToken =
  (predicate: (token: Token) => boolean) =>
  (tokenizer: Tokenizer): Tokenizer =>
  (src) => {
    const match = tokenizer(src);
    return match && predicate(match.token) ? match : undefined;
  };

// ---------------------------------------------------------------------------
// The header rule — H1 . Block ::= "#" Text ; (and ## / ### / ####)
// ---------------------------------------------------------------------------

// `#{1,4}` and not `#+` on purpose: grammar.cf defines exactly four levels, so
// `##### Five` must NOT lex as a header. The required `[ \t]+` is what keeps
// `#Title` out too — that's a paragraph in Markdown, not a header.
//
// Group 1 = the hashes (their count is the level), group 2 = the `Text`.
// The trailing `(?:\n|$)` lands inside match[0], so `raw` includes the newline
// and the walk resumes at the start of the next line.
const HEADING_PATTERN = /^(#{1,4})[ \t]+([^\n]*?)[ \t]*(?:\n|$)/;

// Hash count -> label. A lookup object rather than an array, so TypeScript
// hands back a `TokenKind` instead of `TokenKind | undefined` under
// noUncheckedIndexedAccess.
const KIND_BY_LEVEL = { 1: "H1", 2: "H2", 3: "H3", 4: "H4" } as const;

type HeadingLevel = keyof typeof KIND_BY_LEVEL;

const isHeadingLevel = (n: number): n is HeadingLevel =>
  n === 1 || n === 2 || n === 3 || n === 4;

export const heading: Tokenizer = regexTokenizer(
  HEADING_PATTERN,
  ([hashes, text]) => {
    if (hashes === undefined || text === undefined) return undefined;
    if (!isHeadingLevel(hashes.length)) return undefined;
    return { kind: KIND_BY_LEVEL[hashes.length], text };
  },
);

// The whole Markdown lexer, as one composed tokenizer. Adding a rule next lap
// means writing another `Tokenizer` and adding it to this list — nothing else
// in the file changes. Order is priority: put the most specific rule first.
export const markdownTokenizer: Tokenizer = oneOf(heading);

// ---------------------------------------------------------------------------
// The driver — run a tokenizer over a whole document
// ---------------------------------------------------------------------------

// Normalize CRLF / lone CR up front so no tokenizer ever has to think about it.
// One pure function at the edge removes a class of bugs from every rule.
export const normalizeNewlines = (src: string): string =>
  src.replace(/\r\n?/g, "\n");

// One step of the walk: state is "the source not yet consumed".
const lexStep =
  (tokenizer: Tokenizer) =>
  (rest: string): Step<string, Token> | undefined => {
    if (rest.length === 0) return undefined; // done

    const match = tokenizer(rest);
    if (match) {
      // A tokenizer that matches but consumes nothing would spin forever — the
      // single most common bug when writing your own. Fail loudly instead.
      if (match.raw.length === 0) {
        throw new Error(
          `Tokenizer matched "${match.token.kind}" but consumed no input`,
        );
      }
      return { emit: match.token, next: rest.slice(match.raw.length) };
    }

    // Nothing recognized this line. Headers are the only rule in grammar.cf so
    // far, so prose and blank lines are *skipped*: advance without emitting.
    // Lap 2 (`Para . Block ::= Text ;`) turns this branch into a real token.
    const newline = rest.indexOf("\n");
    return newline === -1 ? undefined : { next: rest.slice(newline + 1) };
  };

// `lexWith` takes a tokenizer and returns a *function from source to tokens*.
// Note what it is: normalize, then unfold. The lexer is a two-step pipeline,
// and every interesting decision lives in the tokenizer that was passed in.
export const lexWith = (
  tokenizer: Tokenizer,
): ((src: string) => readonly Token[]) =>
  flow(normalizeNewlines, unfold(lexStep(tokenizer)));

// The default lexer: partial application, not a subclass.
export const tokenize = lexWith(markdownTokenizer);

// ---------------------------------------------------------------------------
// Next lap: writing your own tokenizer
// ---------------------------------------------------------------------------
//
// The `==highlight==` rule, finished and idiomatic for this file. It's left
// commented out because it's an *inline* rule: registering it needs an inline
// pass (grammar.cf has no inline rules yet) and a `Highlight` variant in
// ../types/parser.ts. Doing that properly is Exercise 5 in
// docs/functional-parsing.md.
//
// export const highlight: Tokenizer = regexTokenizer(
//   /^==(.+?)==/,
//   ([text]) => (text === undefined ? undefined : { kind: "Highlight", text }),
// );
//
// export const markdownTokenizer: Tokenizer = oneOf(heading, highlight);
