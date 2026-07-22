# The Bridge build cycle — how a feature goes from grammar to HTML

A beginner-friendly reference for the **repeatable loop** you follow every time
you add a Markdown feature to Bridge. It's the "how do I actually use the
grammar?" companion to [`initial-guide.md`](./initial-guide.md) (LBNF syntax)
and [`lbnf-guide.md`](./lbnf-guide.md) (the deep dive).

Keep this open while you work. Each new feature (headers, then paragraphs, then
bold, …) walks the same five steps.

---

## The loop at a glance

```
   ┌──────────────────────────────────────────────────────────┐
   │                                                            │
   ▼                                                            │
1. SPEC        2. TYPE          3. PARSE         4. TEST        │
grammar.cf  →  parser.ts     →  parser.ts     →  parser.test.ts │
(a rule)       (a TS type)      (a function)     (bun test) ────┘
                                                    │
                                                    ▼
                                              5. RENDER
                                              toHtml() → <h1>…</h1>
```

You add **one small thing** per lap (one grammar rule), run the loop, see it
pass, then go around again. Never write the whole grammar at once.

---

## Step 1 — SPEC: write the rule in `grammar.cf`

Describe the feature as an LBNF rule *first*. This forces you to pin down two
things before touching code: **what it's made of** (the production) and **what
you'll call the resulting node** (the label).

```
H1 . Block ::= "#" Text ;
```

> BNFC can't generate TypeScript, so this file is a **specification**, not
> something you compile. It's the source of truth your hand-written TS is
> checked against. See [`lbnf-guide.md`](./lbnf-guide.md) §0.

**Read about:** [BNF / grammars (Wikipedia)](https://en.wikipedia.org/wiki/Backus%E2%80%93Naur_form)

---

## Step 2 — TYPE: mirror the rule as a TS type in `parser.ts`

Every labelled rule becomes one variant of a **discriminated union**. The
**label → `kind`**; whatever the production captures → a field.

```ts
export type Block =
  | { kind: "H1"; text: string }
  | { kind: "H2"; text: string }
  | { kind: "H3"; text: string }
  | { kind: "H4"; text: string };

export type Document = Block[]; //  [Block] in the grammar → array in TS
```

The point of Bridge in one sentence: **the grammar and the type are the same
thing written twice.** If they drift apart, one of them is wrong.

**Read about:**
- [Discriminated unions — TypeScript handbook](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [Abstract syntax tree (Wikipedia)](https://en.wikipedia.org/wiki/Abstract_syntax_tree)

---

## Step 3 — PARSE: write the function that recognizes the rule

`parseDocument(src): Document` reads text and produces those nodes. For
line-based features like headers the shape is:

1. `src.split("\n")` into lines.
2. For each line, decide **which rule matches**.
3. Build the matching node; push it into an array.

**The classic beginner trap:** check the **longest marker first**. `"#"` is a
prefix of `"##"`, so testing `H1` before `H2` makes `## Title` wrongly match
`H1`. Order your checks `####` → `###` → `##` → `#`. (This is "maximal munch"
— [`lbnf-guide.md`](./lbnf-guide.md) §7.)

**Read about:**
- [Regular expressions — MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions) (a regex like `/^(#{1,6})\s+(.*)$/` can detect and capture in one shot)
- [The Super Tiny Compiler](https://github.com/jamiebuilds/the-super-tiny-compiler) — a ~200-line, heavily-commented parser+compiler in JS; the single best beginner read for "what a parser actually does"
- [Recursive descent parsing (Wikipedia)](https://en.wikipedia.org/wiki/Recursive_descent_parser) — the technique you'll reach for once features nest

---

## Step 4 — TEST: prove it with `bun test`

Create `parser.test.ts` next to the parser. Assert an input maps to the exact
node you expect. Red → green is your feedback loop (the same loop BNFC's
`TestCalc` gives, but native to Bridge).

```ts
import { test, expect } from "bun:test";
import { parseDocument } from "./parser";

test("# Hi → H1", () => {
  expect(parseDocument("# Hi")).toEqual([{ kind: "H1", text: "Hi" }]);
});
```

Run it from the `bridge/` directory:

```bash
bun test
```

**Read about:** [`bun test` docs](https://bun.sh/docs/cli/test)

---

## Step 5 — RENDER: walk the AST to HTML

The parser gives you a tree; the renderer walks it and emits HTML. Because
`Block` is a discriminated union, a `switch` on `kind` is exhaustive — TS will
warn you if you forget a case.

```ts
// input "# Title"  →  parse  →  [{kind:"H1", text:"Title"}]  →  render  →  "<h1>Title</h1>"
```

That's the entire Bridge idea in miniature: **text → AST → HTML.**

---

## Going around again

Once headers pass, the *next* lap adds a new rule and repeats all five steps:

| Lap | New rule in `grammar.cf`        | What you learn |
|-----|---------------------------------|----------------|
| 1   | headers (`H1`…`H4`)             | the loop itself |
| 2   | `Para . Block ::= Text ;`       | "what separates blocks?" (guide Exercise A) |
| 3   | `*italic*`, `**bold**`          | inline parsing + precedence (Exercise C) |
| 4   | lists                           | where Markdown stops being context-free (Exercise D) |

When a feature *fights back* (lists inside lists is the famous one), that's not
you failing — it's the "[Markdown is not context-free](https://spec.commonmark.org/)"
wall the guides warn about. Note where it hurts; that observation is the real
lesson.

---

## Further beginner reading (whole-topic)

- **[Crafting Interpreters](https://craftinginterpreters.com/)** — a free, famously
  approachable book that builds a lexer, parser, and interpreter from scratch.
  Read the "Scanning" and "Parsing Expressions" chapters.
- **[CommonMark spec — intro](https://spec.commonmark.org/)** — *why* Markdown is
  defined as an algorithm, not a grammar.
- **[MDN: JavaScript string methods](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)**
  — `split`, `slice`, `startsWith`, `trim` are your parsing workhorses.
