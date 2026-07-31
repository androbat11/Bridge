// Bridge — the PARSER (step 3b of docs/build-cycle.md).
//
//   text --[lexer]--> tokens --[parser]--> Document --[renderer]--> HTML
//
// The lexer decided *what each piece of text is*. The parser decides *how the
// pieces fit together*, producing the AST described in ../types/parser.ts.
//
// With only H1..H4 in ../grammar.cf there's no nesting yet, so this pass is
// close to a one-to-one mapping — and that's the point of writing it now,
// while it's trivial. Lap 2 (paragraphs) and lap 4 (lists, which must *group*
// runs of tokens) become edits to one small function instead of rewrites.

import { absurd, flow } from "../core/fp";
import { tokenize, type Token } from "../lexer/texer";
import type { Block, Document } from "../types/parser";

// Token -> AST node. The switch narrows on `kind`, so TypeScript checks the
// object literal against the matching `Block` variant. `absurd` in the default
// branch makes the exhaustiveness a compile-time guarantee: add a token kind
// without handling it here and this file stops compiling.
const blockFromToken = (token: Token): Block => {
  switch (token.kind) {
    case "H1":
    case "H2":
    case "H3":
    case "H4":
      return { kind: token.kind, text: token.text };
    default:
      return absurd(token);
  }
};

// Tokens -> Document. `map` and not a `for` loop with `push`: the input is
// never touched and the output is a fresh array, so this function can't be the
// cause of a bug anywhere else in the pipeline.
export const buildDocument = (tokens: readonly Token[]): Document =>
  tokens.map(blockFromToken);

// The parser is the lexer composed with the AST builder. Read the definition as
// a sentence: to parse, tokenize and then build a document.
export const parseDocument: (src: string) => Document = flow(
  tokenize,
  buildDocument,
);

// Handy when you only care about a single construct, e.g. in a test.
export const parseBlock = (src: string): Block | undefined =>
  parseDocument(src)[0];
