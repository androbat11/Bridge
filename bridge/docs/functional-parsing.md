# Functional parsing in TypeScript — a study guide for Bridge

You are going to write your own Markdown-to-HTML parser. Not use one — write
one. This document is the course notes for the code in `../lib`: **why** it is
shaped the way it is, **how to study it**, and **where to go next** so that by
the end you can build a parsing library from an empty file.

Read it with the code open beside you. Companion docs:
[`build-cycle.md`](./build-cycle.md) (the five-step loop),
[`initial-guide.md`](./initial-guide.md) (LBNF notation),
[`lbnf-guide.md`](./lbnf-guide.md) (grammar deep dive).

---

## 0. The map

Every parser you will ever write, including industrial ones, is this pipeline:

```
  "# Hi"          [{kind:"H1",           [{kind:"H1",          "<h1>Hi</h1>"
                     text:"Hi"}]           text:"Hi"}]
    │                    │                      │                    │
  source ──lexer──▶   tokens ──parser──▶      AST ──renderer──▶     HTML
             │                    │                      │
        texer.ts             parser.ts              render/html.ts
```

Four values, three functions between them. In Bridge those three functions are:

```ts
tokenize      : (src: string)              => readonly Token[]
buildDocument : (tokens: readonly Token[]) => Document
toHtml        : (doc: Document)            => string
```

Notice they fit together like pipe segments — the output type of each is the
input type of the next. That is not an accident, it is the whole design, and it
is why the entire compiler can be written as:

```ts
const markdownToHtml = flow(tokenize, buildDocument, toHtml);
```

**Why three passes and not one big function?** Because each pass gets to be
stupid. The lexer knows about `#` but nothing about HTML. The renderer knows
about `<h1>` but never sees a `#`. When something is wrong you can tell which
pass is wrong by looking at the value between them. Try to do it in one function
and every bug becomes a bug in the same 200 lines.

> **Terminology.** _Lexer_ (also scanner or tokenizer) chops flat text into
> labelled pieces. _Parser_ gives those pieces structure. _AST_ (abstract syntax
> tree) is that structure as data. Many small languages fuse the first two —
> Bridge keeps them apart because Markdown's structure eventually needs it.

---

## 1. Why functions and not classes

The earlier version of `texer.ts` had a `Lexer` class: a constructor, a
registry of tokenizers on `this`, and a `tokenize` method. It worked. Here is
what changed when it became functions, in concrete terms.

**A class instance is one thing. A function composes into new things.**

```ts
// Class world: to lex differently, you build an object and mutate it.
const lexer = new Lexer();
lexer.use(headingTokenizer);
lexer.use(myTokenizer);
const tokens = lexer.tokenize(src);

// Function world: a "different lexer" is an expression.
const tokens = lexWith(oneOf(heading, myTokenizer))(src);
```

The second version has no setup phase and no moment where the lexer is
half-configured. `oneOf(heading, myTokenizer)` **is** a tokenizer, so it can be
passed anywhere a tokenizer goes — including into another `oneOf`. Composition
closes over itself; configuration doesn't.

**Partial application replaces inheritance.** `tokenize` is defined as
`lexWith(markdownTokenizer)` — the default lexer is the general lexer with one
argument already supplied. In the class version, "same driver, different rules"
wanted a subclass or a strategy object. Here it's a function call.

**No `this`, so nothing to get wrong.** `heading` can be pulled out and passed
to `map`, stored in an array, or called in a test with a raw string. Try that
with a method and you learn about `this` binding the hard way.

**The honest counterpoint:** classes are not the enemy, and a language server or
an incremental compiler that maintains real state (a source cache, an error
list, interned strings) is often clearer with them. What you should take from
this is narrower and more durable: **keep the _contract_ a function.** State, if
you must have it, belongs behind that function, not in the type your callers
hold.

---

## 2. Types first: the four types that carry the whole design

Before you write any parsing code, write the types. In a well-typed parser the
types are the design document, and the functions become nearly mechanical.

Bridge has four, and it's worth being able to recite them.

```ts
// 1. What pieces exist?  (one variant per rule in grammar.cf)
type Token =
  | { readonly kind: "H1"; readonly text: string }
  | ... ;

// 2. What does recognizing something produce?
type Match = { readonly raw: string; readonly token: Token };

// 3. What is a rule?
type Tokenizer = (src: string) => Match | undefined;

// 4. What is the result?  (the AST — types/parser.ts)
type Block = { readonly kind: "H1"; readonly text: string } | ... ;
type Document = readonly Block[];
```

Three decisions inside those four lines are worth arguing about, because they
are the ones you will face in your own parser:

**(a) `Token` is a discriminated union, not a `{ type: string, ...}` bag.**
A union of exact shapes means `kind` and the fields that come with it can't
disagree. You cannot construct `{kind: "H1", level: 7}`, and after
`if (token.kind === "H1")` TypeScript _knows_ which fields exist. This one
choice is what lets the compiler check your parser as it grows (§6).

**(b) `raw` lives in `Match`, not in `Token`.** `raw` is bookkeeping: how much
input to consume. The token is the meaning. Real libraries (marked, for
instance) put `raw` on the token, and then every consumer of the AST has to
ignore a field that isn't about meaning — and every test has to spell it out.
Separating them keeps `Token` exactly as wide as the grammar says.

**(c) Failure is `undefined`, not an exception.** A tokenizer that says "not
mine" is doing its job, not failing. Returning a value means `oneOf` can simply
try the next alternative; exceptions would need a `try/catch` per alternative
and would confuse "this rule doesn't apply" with "your input is broken". When
you outgrow `undefined` — because you want _why_ it didn't match — that's a
`Result` type, §8.

> **Exercise, do it now:** in `types/parser.ts`, add `{ kind: "H5" }` to `Block`
> and run `bunx tsc --noEmit`. Read the errors. You just watched the compiler
> hand you a to-do list of every place a new grammar rule must be handled. That
> feedback loop is the reason to bother with types at all.

---

## 3. The key move: a rule _is_ a function

```ts
type Tokenizer = (src: string) => Match | undefined;
```

Stare at this until it feels obvious, because everything else in the lexer is a
consequence of it.

A tokenizer is **total** (never throws for ordinary input), **pure** (same
string in, same match out, no state), and **local** (it only looks at the front
of what it's given; it doesn't know its position in the document, doesn't know
what came before, and can't move a shared cursor).

Those three properties are what buy you the following, and each one is a thing
you would otherwise have to engineer:

- **Testability.** `heading("## Two\nrest")` is a complete test. No lexer to
  construct, no document to set up. See `lexer.test.ts`.
- **Reorderability.** Since nothing is shared, `oneOf(a, b)` and `oneOf(b, a)`
  differ only in priority — a decision you can make, not a bug you discover.
- **Backtracking for free.** `oneOf` "backtracks" by simply calling the next
  function with the same unmodified string. With a mutable cursor you'd have to
  save and restore it, and forgetting to is a classic parser bug.
- **Composability**, which is §4.

---

## 4. Combinators: composition instead of configuration

A **combinator** is a function that takes behaviour and returns behaviour. In
`texer.ts` there are four, and they are the entire extension mechanism:

```ts
regexTokenizer(pattern, build) : Tokenizer            // build one from data
oneOf(...tokenizers)           : Tokenizer            // alternation  (a | b)
mapToken(f)(tokenizer)         : Tokenizer            // transform the result
filterToken(pred)(tokenizer)   : Tokenizer            // reject some matches
```

Compare this to how you'd extend a class-based lexer: subclass it, or add a
`registerRule` method, or a plugin interface with a documented lifecycle. Here,
"the extension mechanism" is _function application_, which you already know.

Two things to notice in the source:

**`oneOf` mirrors the grammar exactly.** `grammar.cf` says a `Block` is one of
four things; `oneOf` is that "one of". When your code's shape matches your
spec's shape, you can check one against the other by reading — which is the
entire point of Bridge ([`build-cycle.md`](./build-cycle.md) §2).

**`oneOf` contains a `for` loop, and that's fine.** Functional programming is
not a ban on loops; it's a discipline about _boundaries_. `oneOf` is a pure
function — no argument mutated, no state touched, same answer every time — and
what's inside is nobody's business. Chasing loop-free code with `reduce` here
would actually be worse: `reduce` visits every alternative even after one has
matched. Purity at the seam, whatever is clearest inside.

**`mapToken` is `map`.** The same `map` as on arrays, promises, and optionals:
"reach inside a wrapper, change the value, keep the wrapper". Once you notice
that you keep writing `map` for your own types, you have found the ladder that
leads to §8.

---

## 5. Where the imperative core hides — and why that's the right place for it

The lexer's driver is:

```ts
const lexWith = (tokenizer: Tokenizer) =>
  flow(normalizeNewlines, unfold(lexStep(tokenizer)));
```

`unfold` (in `core/fp.ts`) is the mirror image of `reduce`: `reduce` folds a
list into one value; `unfold` grows a list out of one value by asking a step
function "what's next?" — which is precisely what a lexer does to a string.

Inside `unfold` there is a `while` loop and a mutable array. **Deliberately.**
The elegant version is recursive:

```ts
const lex = (rest: string): readonly Token[] =>
  rest === "" ? [] : [token, ...lex(remaining)]; // beautiful; also a bug
```

JavaScript has no tail-call elimination in practice, so that overflows the stack
on a long document, and `[...spread]` in a loop is quadratic. So Bridge writes
the loop **once**, in a five-line function with its own tests, and everything
above it stays pure. That trade has a name worth remembering: a **functional
core with an imperative shell** — or here, an imperative _pit_, hidden under a
functional surface.

Two details in `lexStep` are load-bearing, and both are bugs you will otherwise
write yourself:

1. **The zero-progress guard.** A tokenizer that matches but consumes nothing
   makes the driver loop forever. `lexStep` throws instead. A hang gives you no
   information; an exception names the tokenizer.
2. **The skip branch.** When no rule matches, `lexStep` advances past the line
   and emits nothing. That is why `parseDocument("some prose")` is `[]` today.
   It's not an oversight, it's the honest consequence of `grammar.cf` having no
   paragraph rule — and it's pinned by a test so that Exercise 3 has to
   deliberately change it.

---

## 6. Make the compiler maintain your parser

A parser grows one rule at a time, and the danger is always the same: you add a
rule and forget one of the places that must handle it. Two techniques make that
impossible rather than unlikely.

**Exhaustive switches over a union.** In `parser.ts`:

```ts
switch (token.kind) {
  case "H1":
    /* ... */ return { kind: token.kind, text: token.text };
  default:
    return absurd(token);
}
```

`absurd(value: never)` only compiles if `value` has narrowed to `never` — i.e.
if every variant was handled above. Add `"Para"` to `Token` and this file stops
compiling, pointing at the exact switch. The compiler just became the checklist
you would otherwise keep in your head.

**Data over code for variants that don't differ.** In `html.ts`:

```ts
const HEADING_TAG = { H1: "h1", H2: "h2", H3: "h3", H4: "h4" } as const;
```

Four cases differing only by a string don't deserve four functions. But when
variants genuinely diverge — a code block needs a language attribute, a list
needs to recurse — reach for a **dispatch record** typed by a mapped type:

```ts
type Renderers = {
  readonly [K in Block["kind"]]: (block: Extract<Block, { kind: K }>) => string;
};

const renderers: Renderers = {
  H1: (b) => `<h1>${escapeHtml(b.text)}</h1>`,
  // omit a key and it's a compile error; each function gets the *narrowed* type
};
```

That's the same exhaustiveness guarantee as the switch, but as a lookup table
you can iterate, wrap, or override. Both patterns are worth having in hand.

**A third, once you tire of switches:** [ts-pattern](https://github.com/gvergnaud/ts-pattern)
gives real pattern matching with exhaustiveness checking, which is what you
actually want for walking a deep AST.

---

## 7. What purity buys you, concretely

There are tests in `parser.test.ts` that look pointless and are not:

```ts
expect(first).toEqual(second); // same input, same output
expect(first).not.toBe(second); // but a fresh array — nothing shared, nothing cached
```

Because every pass is pure and every output is fresh and `readonly`:

- You can **test any pass in isolation.** `buildDocument([{kind:"H4",…}])` needs
  no source text at all.
- You can **run a stage in a REPL** on a one-line input and read the value. Most
  parser debugging is "what does the value between the passes look like?", and
  pure passes let you ask that directly. `bun repl`, then import and call.
- You can **cache, memoize, parallelize, or re-run** anything without asking
  whether it's safe.
- Bugs are **local**: a wrong token cannot be caused by the renderer.

This is the payoff you should feel while doing the exercises. If you ever find
yourself unable to tell which pass is wrong, some state has leaked between them.

---

## 8. The real destination: from tokenizers to parser combinators

Bridge's `Tokenizer` is one specific instance of a much bigger idea, and this
section is the bridge (yes) from what you have read to a library you could
write yourself. This is the single most important section here.

Look again:

```ts
type Tokenizer = (src: string) => { raw: string; token: Token } | undefined;
```

Two things are hard-coded that don't need to be: the result is always a `Token`,
and "what's left" is expressed indirectly as `raw`. Generalize both:

```ts
type ParseResult<A> = { readonly value: A; readonly rest: string } | undefined;
type Parser<A> = (input: string) => ParseResult<A>;
```

**A parser is a function from input to (a value of any type `A`, plus the
leftover input).** That's it. That single type, plus a handful of combinators,
is how Parsec, Parsimmon, nom, and most functional parsers in any language are
built. Here is a working core — about 40 lines:

```ts
// --- primitives: the smallest parsers that do anything -----------------
const str =
  (literal: string): Parser<string> =>
  (input) =>
    input.startsWith(literal)
      ? { value: literal, rest: input.slice(literal.length) }
      : undefined;

const regex =
  (pattern: RegExp): Parser<string> =>
  (input) => {
    const m = pattern.exec(input); // anchor the pattern with ^
    return m ? { value: m[0], rest: input.slice(m[0].length) } : undefined;
  };

// --- combinators: parsers out of parsers -------------------------------
const map =
  <A, B>(pa: Parser<A>, f: (a: A) => B): Parser<B> =>
  (input) => {
    const r = pa(input);
    return r ? { value: f(r.value), rest: r.rest } : undefined;
  };

// Run `pa`, then let its RESULT choose the next parser. This is the powerful
// one: it's how a parser becomes context-sensitive.
const andThen =
  <A, B>(pa: Parser<A>, f: (a: A) => Parser<B>): Parser<B> =>
  (input) => {
    const r = pa(input);
    return r ? f(r.value)(r.rest) : undefined;
  };

const or =
  <A>(...ps: readonly Parser<A>[]): Parser<A> =>
  (input) => {
    for (const p of ps) {
      const r = p(input);
      if (r) return r; // backtracking = try the same input
    }
    return undefined;
  };

const seq = <A, B>(pa: Parser<A>, pb: Parser<B>): Parser<readonly [A, B]> =>
  andThen(pa, (a) => map(pb, (b) => [a, b] as const));

const many =
  <A>(p: Parser<A>): Parser<readonly A[]> =>
  (input) => {
    const out: A[] = [];
    let rest = input;
    for (;;) {
      const r = p(rest);
      if (!r || r.rest === rest) return { value: out, rest }; // no progress: stop
      out.push(r.value);
      rest = r.rest;
    }
  };

const between = <A>(
  open: Parser<unknown>,
  p: Parser<A>,
  close: Parser<unknown>,
) => andThen(open, () => andThen(p, (a) => map(close, () => a)));
```

And now grammar rules become one-liners that read like the grammar:

```ts
const bold = map(
  between(str("**"), regex(/^[^*]+/), str("**")),
  (text) => ({ kind: "Bold", text }) as const,
);

const heading = map(
  seq(regex(/^#{1,4}/), regex(/^[ \t]+[^\n]*/)),
  ([hashes, text]) => ({ kind: `H${hashes.length}`, text: text.trim() }),
);
```

Compare that `bold` to what you'd write by hand with indexes and `slice`. The
combinators are doing the bookkeeping, and the bookkeeping is where the bugs
live.

Three things to understand about this, in order:

1. **`or` gives you backtracking, and backtracking costs.** Naive combinators
   can re-parse the same input many times (exponentially, for pathological
   grammars). Real libraries add `try`/committed choice, memoization (that's
   _packrat_ parsing, which makes PEG linear-time), or cuts. Learn the naive
   version first, then read why Parsec has `try`.
2. **`map` and `andThen` are not arbitrary names.** A type with `map` is a
   _functor_; with `andThen` (a.k.a. `chain`, `flatMap`, `bind`) it's a _monad_.
   You just built a monad without the vocabulary — which is the right order to
   learn it. Hutton & Meijer's paper (§10) is the original, and it's readable.
3. **Left recursion breaks it.** `Exp ::= Exp "+" Exp` written directly as
   combinators calls itself forever. The fixes — rewriting to iteration
   (`chainl`), or Pratt / precedence-climbing parsing — are the next thing to
   learn after combinators, and are what you need for expressions with
   precedence. See matklad's Pratt article in §10.

**Where combinators shine and where they don't.** They are wonderful for JSON,
config formats, arithmetic, query languages, most programming languages — any
grammar that's genuinely context-free-ish. They fight you on Markdown (§9). So
build your combinator library against JSON (Exercise 6), then decide what
Markdown actually needs.

---

## 9. Where Markdown fights back

You will hit this, so hear it now: **Markdown is not context-free, and no
grammar file can fully describe it.** `grammar.cf` in this repo is a teaching
spec, not a machine-checkable definition of the language. That's why
CommonMark's spec is written as an _algorithm in prose with 600+ examples_
rather than a grammar.

The three walls, in the order you'll meet them:

1. **Lookahead / lookbehind across lines.** Setext headings (`Title` then
   `=====`) mean a line's meaning depends on the _next_ line. A `Tokenizer` that
   only sees the front of the remaining input handles this fine (the rest of the
   document is right there), but it changes how you think — the boundary between
   "this token" and "the next" is no longer a line.
2. **Indentation and containers.** Lists and blockquotes nest by indentation,
   and their content is _itself_ a document. This is where real implementations
   split into two phases: a **block** pass that builds the container tree
   line-by-line, then an **inline** pass that runs over the text inside each
   leaf. Bridge's `level?: "block" | "inline"` field on tokenizers is a
   placeholder for exactly that split.
3. **Delimiter runs.** `**bold**`, `*em*`, `***both***`, `a * b`, `snake_case`
   vs `_em_`. CommonMark resolves these with an explicit stack-based algorithm
   ("process emphasis") because no regex or grammar gets it right. Read that
   section of the spec once; it will permanently change how you feel about
   Markdown.

Note where it hurts as you go. Those notes _are_ the lesson —
[`build-cycle.md`](./build-cycle.md) says the same thing, and it's the most
valuable output of this project.

---

## 10. Reading list

Curated and ordered. Don't read it all — read the tier you're in. (Links drift;
search the title if one 404s.)

### Tier 1 — start here, this week

| What                                                                                                                  | Why this one                                                                                               |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [The Super Tiny Compiler](https://github.com/jamiebuilds/the-super-tiny-compiler)                                     | ~200 heavily commented lines: tokenizer → parser → transformer → generator. Read it in one sitting, twice. |
| [Crafting Interpreters](https://craftinginterpreters.com/) — "Scanning" + "Representing Code" + "Parsing Expressions" | The best-explained parser writing anywhere. Free online. Chapters 4–6 are exactly what you're doing.       |
| [TS Handbook: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)                               | Discriminated unions and exhaustiveness are the backbone of §2 and §6.                                     |
| [Mostly Adequate Guide to FP](https://mostly-adequate.gitbook.io/mostly-adequate-guide/) ch. 1–8                      | Currying, composition, and _why_, in JavaScript, free. Chapter 5 is `flow`.                                |

### Tier 2 — functional parsing proper

| What                                                                                                                                                      | Why this one                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [Understanding Parser Combinators](https://fsharpforfunandprofit.com/parser/) — Scott Wlaschin                                                            | Builds §8 from zero, slowly, with pictures. The single best on-ramp to combinators. F#, but readable if you know TS.           |
| [Monadic Parsing in Haskell](https://www.cs.nott.ac.uk/~pszgmh/pearl.pdf) — Hutton & Meijer (1998)                                                        | The original functional-pearl. Six pages. You've already built most of it; read it to get the names right.                     |
| [Parsimmon](https://github.com/jneen/parsimmon) source                                                                                                    | A real, small, JS combinator library. Read it after writing your own and compare choices.                                      |
| [Parsec paper](https://www.microsoft.com/en-us/research/publication/parsec-direct-style-monadic-parser-combinators-for-the-real-world/) — Leijen & Meijer | Where error messages, `try`, and committed choice come from — the things naive combinators lack.                               |
| [fp-ts](https://gcanti.github.io/fp-ts/) / [Effect](https://effect.website/)                                                                              | The industrial versions of `core/fp.ts`. Look _after_ you've hand-rolled the helpers, or the abstractions won't mean anything. |

### Tier 3 — parsing theory, when a grammar fights you

| What                                                                                                             | Why this one                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Simple but Powerful Pratt Parsing](https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html) | The cure for left recursion and operator precedence. Short, practical, canonical.                   |
| [Parsing Expression Grammars](https://bford.info/pub/lang/peg.pdf) — Ford (2004)                                 | PEG = ordered choice + packrat memoization. This is the formalism your `oneOf` secretly implements. |
| _Language Implementation Patterns_ — Terence Parr                                                                | Catalogue of practical techniques from the author of ANTLR.                                         |
| _Writing an Interpreter in Go_ — [interpreterbook.com](https://interpreterbook.com/)                             | Pratt parser built step by step; famously approachable.                                             |
| [Peggy](https://peggyjs.org/) · [Chevrotain](https://chevrotain.io/) · [Ohm](https://ohmjs.org/)                 | Grammar-driven JS/TS tooling. Try one to feel what you gain and lose vs hand-writing.               |

### Tier 4 — Markdown specifically

| What                                                                                     | Why this one                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [CommonMark spec](https://spec.commonmark.org/)                                          | Read the introduction, then "Emphasis and strong emphasis". This is §9 in full detail.                                                       |
| [Babelmark 3](https://babelmark.github.io/)                                              | Same input across ~20 implementations. Paste your tricky cases; watch them disagree. Humbling and instructive.                               |
| [markdown-it](https://github.com/markdown-it/markdown-it) source                         | A clean, fast, CommonMark-compliant implementation. Look at `rules_block/` and `rules_inline/` — the two-phase split from §9, in production. |
| [mdast](https://github.com/syntax-tree/mdast) + [unified/remark](https://unifiedjs.com/) | A standardized Markdown AST and an ecosystem of transforms. Compare their node types to your `Block`.                                        |
| [Beyond Markdown](https://johnmacfarlane.net/beyond-markdown.html) — John MacFarlane     | The CommonMark author on why Markdown is hard to specify. Read after you've felt it yourself.                                                |

### Tier 5 — proving you're right

| What                                                  | Why this one                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [fast-check](https://fast-check.dev/)                 | Property-based testing for TS. Generate thousands of documents; assert invariants instead of examples (§13). |
| [bun test docs](https://bun.sh/docs/cli/test)         | `bun test --watch` is your feedback loop. Learn `--coverage` too.                                            |
| [ts-pattern](https://github.com/gvergnaud/ts-pattern) | Exhaustive pattern matching for AST walks — the ergonomic end-state of §6.                                   |

---

## 11. How to study this repository

Reading code teaches less than you'd hope. These three techniques teach a lot.

**A. Read in dependency order, values first.** `core/fp.ts` →
`lexer/texer.ts` (types only) → `heading` → the combinators → `lexWith` →
`parser/parser.ts` → `render/html.ts`. At each step ask _what value does this
produce_, not _what does this code do_. Run `bun run index.ts` and look at the
printed tokens and AST while you read.

**B. Read the tests as the specification.** `lexer.test.ts` states what the
lexer means, including the deliberate gaps (prose is skipped, five hashes are
not a header). When you change the code, the tests tell you what you promised.

**C. Retype it from memory — the one that actually works.** Delete
`lib/lexer/texer.ts`, keep the tests, and rewrite it until `bun test` passes.
You will discover exactly which parts you understood and which you had merely
read. Do the same for `core/fp.ts` — it's 40 lines and it will take you longer
than you expect. This is worth more than reading five articles.

**Tooling habits worth building now**

```bash
bun test --watch          # keep this running in a second terminal
bunx tsc --noEmit         # the type errors ARE the to-do list
bun repl                  # import a stage, call it on one line of input
bun run index.ts          # see all four values of the pipeline at once
```

---

## 12. Exercises

Graded. Each one follows the five-step loop in
[`build-cycle.md`](./build-cycle.md): **spec → type → parse → test → render.**
Write the test _before_ the implementation; a failing test is the point.

> **Exercise 1 — Predict, then verify** (30 min, no code)
> Write down, on paper, what `tokenize` returns for each of:
> `"###### Six"`, `"  # Indented"`, `"#\tTabbed"`, `"# a # b"`, `"##"`,
> `"# one\n# two"`, `"#### Four\n##### Five"`.
> Then run them in `bun repl` and compare. Every mismatch is a place your model
> of the code was wrong — go find out why in the regex.
> _Done when:_ you can predict all seven correctly and explain each.

> **Exercise 2 — Add H5 and H6** (1 hour)
> All five steps: a rule in `grammar.cf`, variants in `types/parser.ts`, the
> tokenizer change, tests, and the renderer. Let `tsc` drive you — start by
> adding the type and following the errors.
> _Done when:_ `##### Five` lexes, `####### Seven` does not, and `bun test` is
> green. _Notice:_ how few places you had to touch, and that the compiler found
> all of them.

> **Exercise 3 — Paragraphs** (half a day; the first real one)
> `Para . Block ::= Text ;`. This forces the question the skip branch in
> `lexStep` has been dodging: **what ends a paragraph?** A blank line? A
> heading? End of input? Decide, write it down as a comment, then implement.
> _Done when:_ `"a\nb\n\nc"` gives you two paragraphs and you have a test for
> each boundary you chose. You will have to change the "prose is skipped" tests
> — that's the exercise working.

> **Exercise 4 — Setext headings** (half a day)
> `Title\n=====` is an H1; `Title\n-----` is an H2. Now a line's meaning depends
> on the line _after_ it, and it must beat the paragraph rule from Exercise 3
> (priority in `oneOf`).
> _Done when:_ `"Hi\n==\n"` is an H1, `"Hi\nthere\n"` is one paragraph, and you
> can explain why the rule order in `markdownTokenizer` matters.

> **Exercise 5 — An inline pass** (a day or more; the big jump)
> Add `**bold**`, `*em*`, and the `==highlight==` sketch at the bottom of
> `texer.ts`. This changes the AST: `text: string` becomes
> `children: readonly Inline[]`, and `renderBlock` must recurse. Two phases now
> — block structure first, then inline within each block (§9).
> _Done when:_ `"# a **b** c"` renders `<h1>a <strong>b</strong> c</h1>`. Then
> try `"***both***"` and `"a*b*c"` and go read the CommonMark emphasis rules.

> **Exercise 6 — Build the combinator library, on JSON** (a day)
> Type out §8's `Parser<A>` from scratch and parse JSON with it — numbers,
> strings, `true`/`false`/`null`, arrays, objects, whitespace. JSON is small,
> fully specified, and genuinely context-free, so the combinators are a joy
> instead of a fight.
> _Done when:_ `parseJson('{"a":[1,2,{"b":null}]}')` matches `JSON.parse`.
> _Then:_ add error messages ("expected `,` or `}` at offset 17") by replacing
> `undefined` with `{ ok: false; expected: string; at: number }`. That change is
> the difference between a toy and a library.

> **Exercise 7 — Nested lists** (open-ended; where it hurts)
> `- a` / `  - b`. Bullets, ordered lists, loose vs tight, paragraphs inside
> items. Keep a `NOTES.md` of every case where "one rule = one function" stops
> being enough.
> _Done when:_ you can state, in your own words, why Markdown needs a container
> stack rather than a grammar. That sentence is the real deliverable of this
> whole project.

> **Exercise 8 — Prove it** (ongoing)
> Add `fast-check` and assert properties, not examples:
> `toHtml(parseDocument(s))` never throws for any string; parsing is idempotent
> on its own output; any generated `"#".repeat(n) + " x"` yields exactly one
> block for `n ≤ 6` and none for `n > 6`; escaping is never bypassed.
> Then paste your weirdest inputs into Babelmark and see who agrees with you.
> _Done when:_ a property test finds a bug your examples missed. It will.

---

## 13. A study plan

Four weeks at a few hours a day, or four months at a weekend each — the order
matters more than the pace. Move on when you hit the signal, not the date.

**Week 1 — the loop.** Read Tier 1 (Super Tiny Compiler; Crafting Interpreters
4–6). Exercises 1 and 2. Retype `core/fp.ts` and `texer.ts` from memory
(technique C).
_Signal:_ you can add a grammar rule end to end without rereading
`build-cycle.md`.

**Week 2 — real structure.** Exercises 3 and 4. Read the CommonMark
introduction. Start `NOTES.md` for every ambiguity you have to decide by fiat.
_Signal:_ you can say what makes a line a paragraph vs a heading, and why the
answer needed lookahead.

**Week 3 — combinators.** Wlaschin's series, then Exercise 6 (JSON, with error
messages). Then Hutton & Meijer for the vocabulary, and matklad on Pratt
parsing.
_Signal:_ you can write `many`, `seq`, and `or` from scratch and explain why
left recursion loops forever.

**Week 4 — depth and honesty.** Exercise 5 (inline), then start 7. Read
`markdown-it`'s block and inline rules. Exercise 8's property tests.
_Signal:_ you can explain, with an example, why your parser disagrees with
CommonMark — and decide whether you care.

**After that**, pick one: make Bridge CommonMark-compliant for a subset and
prove it against the spec's test suite; or publish your combinator library from
Exercise 6; or write a parser for something that isn't Markdown (a config
format, a query language, a subset of TypeScript). The third teaches the most,
because it removes Markdown's weirdness and leaves only the parsing.

---

## 14. The five sentences to remember

1. **A parser is a function from input to a value plus the leftover input** —
   everything in §8 follows from that one type.
2. **Design the types first**; with discriminated unions, the compiler becomes
   the checklist that keeps your parser honest as the grammar grows.
3. **Make the contract a function** so that combining behaviour is just calling
   a function, and keep any loop or mutation inside one small tested core.
4. **Separate the passes** — text → tokens → AST → output — so that every bug
   has an address.
5. **Markdown is defined by an algorithm, not a grammar**; when it fights you,
   you have found the lesson, not the failure.
