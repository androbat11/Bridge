// Bridge — the RENDERER (step 5 of docs/build-cycle.md).
//
// Walk the AST, emit HTML. This is where "text -> AST -> HTML" pays off: the
// renderer never looks at the source string, only at typed nodes, so HTML
// concerns (escaping, tag names) can't leak into parsing concerns and vice
// versa. Swapping this module for `toLatex` or `toPlainText` requires touching
// nothing else.

import { flow } from "../core/fp";
import { parseDocument } from "../parser/parser";
import type { Block, Document } from "../types/parser";

// A tiny factory: `replace(pattern, with)` returns a `string => string`, which
// is exactly the shape `flow` composes. Turning a two-argument method into a
// one-argument function is the move that makes pipelines possible — the
// technique is called currying.
const replace =
  (pattern: RegExp, replacement: string) =>
  (text: string): string =>
    text.replace(pattern, replacement);

// The text in `{ kind: "H1", text: "…" }` is *source* text, not HTML. Emitting
// it raw would let `# <script>` become a real tag.
//
// `&` MUST be escaped first: do it last and it would rewrite the `&` in the
// `&lt;` produced by an earlier step, giving `&amp;lt;`. Order inside a `flow`
// is program logic, not formatting.
export const escapeHtml: (text: string) => string = flow(
  replace(/&/g, "&amp;"),
  replace(/</g, "&lt;"),
  replace(/>/g, "&gt;"),
  replace(/"/g, "&quot;"),
);

// Label -> tag name. Data, not code: four cases that differ only in a string
// don't deserve four functions. (When variants genuinely diverge, use a
// dispatch record of renderers instead — docs/functional-parsing.md §6.)
const HEADING_TAG = { H1: "h1", H2: "h2", H3: "h3", H4: "h4" } as const;

const element =
  (tag: string) =>
  (children: string): string =>
    `<${tag}>${children}</${tag}>`;

export const renderBlock = (block: Block): string =>
  flow(escapeHtml, element(HEADING_TAG[block.kind]))(block.text);

export const toHtml = (doc: Document): string =>
  doc.map(renderBlock).join("\n");

// The whole pipeline, as a composition of the three passes.
export const markdownToHtml: (src: string) => string = flow(
  parseDocument,
  toHtml,
);
