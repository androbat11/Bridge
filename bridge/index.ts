// Bridge — one lap of the build cycle, end to end.
// See docs/build-cycle.md for the loop, docs/functional-parsing.md for the
// design. Run with: bun run index.ts

import { pipe } from "./lib/core/fp";
import { tokenize } from "./lib/lexer/texer";
import { buildDocument, parseDocument } from "./lib/parser/parser";
import { markdownToHtml, toHtml } from "./lib/render/html";

const source = `# Bridge

## Overview

### Why this exists

#### Notes`;

// The pipeline, one stage at a time — each value below is worth inspecting.
const tokens = tokenize(source);
const doc = buildDocument(tokens);
const html = toHtml(doc);

console.log("--- 1. source ---\n" + source);
console.log("\n--- 2. tokens (lexer) ---");
console.log(tokens);
console.log("\n--- 3. AST (parser) ---");
console.log(doc);
console.log("\n--- 4. HTML (renderer) ---\n" + html);

// The same thing said as a composition. `markdownToHtml` is literally
// `flow(parseDocument, toHtml)`, and `parseDocument` is `flow(tokenize,
// buildDocument)` — so the whole compiler is four functions glued end to end.
console.log("\n--- same result, composed ---");
console.log(markdownToHtml(source) === html);
console.log(pipe(source, parseDocument, toHtml) === html);
