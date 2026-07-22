# Learning LBNF — a guide for the Bridge Markdown compiler

A self-teaching reference for **LBNF** (Labelled Backus–Naur Form), the grammar
notation consumed by **BNFC** (the BNF Converter). This doc teaches you the
notation with small, generic examples so that *you* can write the Markdown
grammar yourself. It does **not** contain the Markdown grammar — that's your
exercise (see §11).

---

## 0. Read this first — how LBNF fits into Bridge

Two facts that shape everything below:

1. **BNFC does not generate TypeScript/JavaScript.** Its output targets are
   Haskell, Java, C, C++, OCaml, and Agda. Bridge is a Bun/TS library, so you
   will not be able to `import` BNFC's output into your code.

   → **Use LBNF as a *specification*.** Writing the grammar formally forces you
   to pin down your token set and AST shape precisely. You then hand-write the
   TS lexer/parser (the `texer.ts` / parser you already started) to *match* the
   spec. The `.cf` file becomes the source of truth your code is checked
   against, and you can still run BNFC (in Haskell, say) to *test that your
   grammar parses* before you translate it to TS.

2. **Markdown is not context-free.** BNFC produces an **LALR(1)** parser
   (via Alex+Happy / Flex+Bison / JFlex+CUP). Indentation, lazy list
   continuation, and the block-then-inline two-pass model of real Markdown
   cannot be expressed as a clean LALR grammar — which is why
   [CommonMark](https://spec.commonmark.org/) is defined as a *parsing
   algorithm*, not a grammar. You **can** capture a useful subset (headers,
   paragraphs, bold/italic, simple lists). Aim for that first.

> If at some point you'd rather have a parser generator that *does* emit TS,
> the ecosystem equivalents are `peggy` (PEG), `nearley`, `chevrotain`, and
> `ohm`. LBNF is still worth learning as the notation for *thinking* about
> grammars — but keep this option in your back pocket.

---

## 1. The one rule you must internalize

Every line of an LBNF grammar is a **labelled rule**:

```
Label . Category ::= production ;
```

- **`Label`** — the name of the AST node this rule builds. This is the "L" in
  LBNF and the whole point: the grammar *is* your abstract syntax.
- **`Category`** — a non-terminal (a "kind of thing"). Starts with a capital
  letter by convention.
- **`::=`** — "is defined as".
- **`production`** — a sequence of terminals (quoted strings) and categories.
- **`;`** — ends the rule.

Example — this single line simultaneously defines concrete syntax *and* an AST
constructor `ENum` that holds an `Integer`:

```
ENum . Exp ::= Integer ;
```

Read it as: *"An `Exp` can be an `Integer`; when it is, build a node called
`ENum`."*

### 1.1 A closer look — label vs. category vs. production

The three parts trip people up, so here they are dissected on a real Bridge
rule (a Markdown header). Anatomy first:

```
H1 . Block ::= "#" Text ;
     └┬─┘   └────┬────┘
    category  production
 └┬┘
 label
```

**Label (`H1`) — a name *you* invent for the AST node.** When the parser
matches this rule, it builds a node you can later inspect as *"this is an
`H1`."* The name has **no meaning to the tool** beyond that — `H1` could be
`Heading1`, `BigTitle`, or `Foo` and the parser would behave identically. It
matters only to *your* downstream code, which reads the label to decide "emit
`<h1>`." (The one special label is `_`, §4: *"build no node — pure plumbing."*)

**Category (`Block`) — a "kind of thing" in your language.** `Block` is your
name for *"a top-level chunk of a Markdown document."* Its job is to **group
alternatives**: every rule with `Block` on the left is one possible shape a
block can take.

```
H1 . Block ::= "#" Text ;
H2 . Block ::= "##" Text ;
H3 . Block ::= "###" Text ;
```

All three share the category `Block`, so together they say: *"A `Block` is
**any one of** these shapes."* The category is the question ("what can a block
be?"); each labelled rule is one answer. Later you add paragraphs, lists, etc.
as more `... . Block ::= ...` rules.

**How a category is "identified" — a common misconception.** `Block` doesn't
*belong to* a category; `Block` **is** the category. There is no separate
registry where categories are declared. A category is identified purely by
**position and spelling**: it is the capitalized word sitting between the `.`
and the `::=`. The tool learns `Block` exists *simply because you used it
there.* Categories then reference each other by name — the `Text` appearing in
the production above refers to whatever `... . Text ::= ...` rule (or `token`
declaration) defines `Text` elsewhere. That name-matching is what wires the AST
together. Capitalization is how the tool tells the category `Text` apart from
the literal `"text"`.

**Production (`"#" Text`) — the right-hand sequence to match:** quoted strings
are terminals (literal text), bare capitalized names are categories.

### 1.2 A full mini-grammar — a JS variable declaration

Everything above, working together on something other than headers. This parses
a single declaration like `let x = 42 ;`:

```
-- JsVar.cf

DLet   . Decl  ::= "let"   Ident "=" Value ";" ;
DConst . Decl  ::= "const" Ident "=" Value ";" ;
DVar   . Decl  ::= "var"   Ident "=" Value ";" ;

VNum . Value ::= Integer ;
VStr . Value ::= String ;

entrypoints Decl ;
```

- **`Decl`** is a category — "a variable declaration" — with three
  alternatives, so a `Decl` is `let …` **or** `const …` **or** `var …`.
- **`DLet` / `DConst` / `DVar`** are labels; downstream code reads them to know
  *which* keyword was used. (The distinction lives in the label here, like your
  `H1`/`H2` — fine for a fixed set of keywords; it only becomes awkward when the
  count is open-ended, like 1–6 `#`s. See §Exercise B.)
- **`"let"`, `"="`, `";"`** are terminals.
- **`Ident`, `Integer`, `String`** are built-in categories (§6) — undeclared;
  `Ident` matches `x`, `myVar`, …
- **`Value`** is a category you define, with two shapes.
- **`entrypoints Decl`** says where parsing starts.

Input `let x = 42 ;` produces the tree `DLet(Ident "x", VNum 42)` — and that
structure is exactly what a hand-written TS pass would walk to emit code. The
matching AST:

```ts
type Decl =
  | { kind: "DLet";   name: string; value: Value }
  | { kind: "DConst"; name: string; value: Value }
  | { kind: "DVar";   name: string; value: Value };

type Value =
  | { kind: "VNum"; value: number }
  | { kind: "VStr"; value: string };
```

> Note: LBNF describes **one** language's syntax — it parses source *into* an
> AST; it does not translate between languages. Any "Python → JS" style
> transformation is the hand-written TS step that walks this AST, not something
> the grammar expresses.

---

## 2. Setup and the edit → generate → test loop

You don't need this to *learn* the notation, but running BNFC gives you a real
parser to test your grammar against.

Install (pick one):

```bash
# Debian/Ubuntu
sudo apt install bnfc

# Haskell toolchain
cabal install BNFC        # or: stack install BNFC

# macOS
brew install bnfc
```

Grammar files use the extension **`.cf`**. The workflow:

```bash
bnfc -m --haskell Calc.cf   # generate lexer, parser, AST, printer + a Makefile
make                        # build (needs alex, happy, ghc)
echo "1 + 2 * 3" | ./TestCalc   # parse a sample and print the AST + tree
```

`TestCalc` prints the token stream, the parse tree, and the linearized output —
which is exactly the feedback loop you want when debugging a grammar.

> The `--haskell` backend is the fastest to get running. Use `--java`, `--c`,
> etc. only if you have that toolchain handy. Remember: the *generated code* is
> throwaway for Bridge — you're using it to validate the grammar, not to ship.

---

## 3. Worked example: a JavaScript expression grammar

Every JS developer already knows this language — it's the arithmetic inside
`const total = 1 + 2 * 3;`. JS evaluates that as `1 + (2 * 3) = 7`, **not**
`(1 + 2) * 3 = 9`, because `*` binds tighter than `+`. This grammar encodes
exactly that precedence. Study it, then we'll dissect it.

```
-- Expr.cf  — the expression sublanguage of JavaScript

EAdd . Exp  ::= Exp  "+" Exp1 ;
ESub . Exp  ::= Exp  "-" Exp1 ;
EMul . Exp1 ::= Exp1 "*" Exp2 ;
EDiv . Exp1 ::= Exp1 "/" Exp2 ;
ENum . Exp2 ::= Integer ;

coercions Exp 2 ;
```

Things to notice:

- **Terminals are quoted** (`"+"`), categories are not (`Exp`, `Integer`).
- `Integer` is a **built-in** category (§6) — you don't define it.
- The `1` / `2` suffixes on `Exp` encode **precedence levels** (§4). Level 1
  (`*`, `/`) binds tighter than level 0 (`+`, `-`) — the JS rule, spelled out.
- Every alternative has a distinct label — those become your AST node names.

The AST this describes, as a TypeScript discriminated union (exactly what you'd
model in `types.ts`):

```ts
type Exp =
  | { kind: "EAdd"; left: Exp; right: Exp }
  | { kind: "ESub"; left: Exp; right: Exp }
  | { kind: "EMul"; left: Exp; right: Exp }
  | { kind: "EDiv"; left: Exp; right: Exp }
  | { kind: "ENum"; value: number };
```

Parsing `1 + 2 * 3` yields the tree
`EAdd(ENum 1, EMul(ENum 2, ENum 3))` — the `*` bundled below the `+`, just like
V8 would build it. See how the grammar and the AST are the *same thing*
expressed twice? That's the payoff for Bridge: your `.cf` file dictates your
`Token` / node types.

> If you've ever hand-written a recursive-descent expression parser in JS
> (`parseExpression` calling `parseTerm` calling `parseFactor`), those three
> functions *are* the three `Exp` levels here. LBNF just names the pattern.

---

## 4. Precedence and `coercions`

`Exp`, `Exp1`, `Exp2` are precedence *levels* of the same idea, from loosest
(0) to tightest binding. Higher-numbered = binds tighter. `Exp2` (an integer or
a parenthesized expression) binds tighter than `Exp1` (`*`, `/`) which binds
tighter than `Exp` (`+`, `-`).

To let a tighter expression stand in wherever a looser one is expected (e.g. a
bare `Integer` used as a full `Exp`), you need **coercion rules**:

```
_ . Exp  ::= Exp1 ;
_ . Exp1 ::= Exp2 ;
_ . Exp2 ::= "(" Exp ")" ;
```

- The label **`_`** means "no AST node — this is pure plumbing." A coercion
  doesn't create a tree node; it just says "level N is also acceptable as level
  N-1."
- The last rule adds parentheses to jump back to the top level.

Writing those `_` rules by hand is tedious, so LBNF gives you a shorthand
pragma that generates them all:

```
coercions Exp 2 ;
```

This means "`Exp` has levels up to 2; generate the coercions and the
parenthesis rule automatically." That one line replaces the three `_` rules
above. **This is why the expression grammar in §3 ends with `coercions Exp 2 ;`.**

> Mental model: precedence levels are how you resolve ambiguity in an LALR
> grammar *without* the parser complaining about conflicts. When BNFC warns
> about shift/reduce conflicts, missing or wrong precedence levels are the
> usual cause.

---

## 5. Lists: `terminator` and `separator`

Sequences (statements, list items, inline runs) are so common that LBNF has
first-class support. A category in brackets, `[Exp]`, means "a list of `Exp`".

You *could* define lists manually with two rules — an empty case and a
cons case:

```
[] .  [Exp] ::= ;                 -- empty list
(:) . [Exp] ::= Exp "," [Exp] ;   -- one Exp, then the rest
```

`[]` and `(:)` are special built-in labels (nil and cons). But again, there's
a shorthand:

```
separator  Exp "," ;   -- items separated by commas: a, b, c
terminator Exp ";" ;   -- items each followed by ; : a; b; c;
```

- **`separator`** — the delimiter sits *between* items (`a, b, c`).
- **`terminator`** — the delimiter follows *every* item (`a; b; c;`).
- Add **`nonempty`** to forbid the empty list:
  `separator nonempty Exp "," ;`
- Use `separator Exp ""` (empty string) for items with **no** delimiter — just
  juxtaposition. **This is the one to think hard about for Markdown**, where a
  paragraph is a run of inline elements with nothing between them.

---

## 6. Built-in token categories

These come predefined — use them without declaring them:

| Category  | Matches                                             |
|-----------|-----------------------------------------------------|
| `Integer` | integer literals, e.g. `42`                         |
| `Double`  | floating point, e.g. `3.14`                         |
| `String`  | double-quoted strings, e.g. `"hi"`                  |
| `Char`    | single-quoted characters, e.g. `'a'`                |
| `Ident`   | identifiers: a letter then letters/digits/`_`/`'`   |

For Bridge, `Ident` and `String` probably won't fit Markdown's needs — you'll
define your own token types instead (next section).

---

## 7. Defining your own tokens — the LBNF regex mini-language

When the built-ins don't fit, declare a token type. This is likely where most
of your Markdown work lives (what counts as "text"? what's a run of `#`?).

```
token UpperWord (upper (letter | digit | '_')*) ;
```

This defines a category `UpperWord` and the regex that recognizes it. The
regex operators available inside `token` are their **own little language** —
*not* PCRE. Learn these:

| Syntax        | Meaning                                             |
|---------------|-----------------------------------------------------|
| `'c'`         | the literal character `c`                           |
| `{"abc"}`     | the literal **string** `abc`                        |
| `["abc0-9"]`  | any **one** character from the set                  |
| `letter`      | any alphabetic character (`upper` \| `lower`)       |
| `upper`       | `A`–`Z`                                             |
| `lower`       | `a`–`z`                                             |
| `digit`       | `0`–`9`                                             |
| `char`        | any character at all                                |
| `eps`         | the empty string (epsilon)                          |
| `r s`         | `r` followed by `s` (sequence)                      |
| `r \| s`      | `r` or `s` (choice)                                 |
| `r - s`       | strings matching `r` but **not** `s` (difference)   |
| `r*`          | zero or more                                        |
| `r+`          | one or more                                         |
| `r?`          | optional                                            |

The **difference operator `-`** is the one people forget and the one you'll
want for Markdown — e.g. "any character that is not a newline or a `*`".

Two useful extras:

- **`position token Name (...)`** — same as `token`, but the lexer records the
  line/column where each token appeared. Handy if Bridge will report source
  positions in errors.
- Token rules are matched by the **lexer** (maximal munch), so they interact
  with your grammar rules — a badly-scoped token can swallow text you meant to
  parse structurally.

---

## 8. Comments

Tell the lexer what to skip. Two forms:

```
comment "--" ;            -- everything from -- to end of line
comment "{-" "-}" ;       -- everything between {- and -} (block)
```

Markdown technically has HTML comments `<!-- -->`; whether you model those as
`comment` (skipped) or as real nodes is a design decision for you.

---

## 9. Pragmas you should know exist

Beyond `coercions`, `separator`, `terminator`, `token`, and `comment`:

- **`entrypoints Document, Block ;`** — which categories the generated parser
  will accept as a starting point. Default is the first category. For Bridge
  your entrypoint is probably a top-level `Document`.

- **`layout`** — indentation / offside-rule support:
  `layout toplevel ;`, `layout "where" ;`, `layout stop "in" ;`. This is the
  closest LBNF gets to handling Markdown-style indentation (nested lists, code
  blocks). It's powerful but fiddly; treat it as advanced.

- **`rules`** — a shorthand that auto-generates labels for a set of simple
  alternatives:
  `rules Bullet ::= "-" | "*" | "+" ;`
  generates three rules with auto-derived labels. Great for "one of these
  literal markers" situations — think about Markdown's three bullet characters.

- **`define`** — lets you introduce derived/desugaring constructors without
  adding concrete syntax.

- **`internal`** — an AST node that exists for your tree but has *no* concrete
  syntax (the parser never builds it; you construct it in later passes). Useful
  if your AST needs nodes that don't appear literally in the source.

---

## 10. Common pitfalls (read before your first conflict)

- **Shift/reduce & reduce/reduce conflicts.** LALR(1) means the parser decides
  with one token of lookahead. Ambiguity → conflict warnings from BNFC. Fix
  with precedence levels (§4), not by ignoring them.
- **Left vs right recursion.** `EAdd. Exp ::= Exp "+" Exp1` is *left*-recursive
  (left-associative `+`). LALR handles left recursion well — prefer it. (This
  is the opposite of what recursive-descent / PEG tools want, so don't carry
  habits over.)
- **Token rules are greedy.** A `token` that matches "any run of non-space
  chars" will eat your `#` and `*` markers. Scope tokens narrowly.
- **Whitespace is significant in Markdown but ignored by default in BNFC.** The
  default lexer discards spaces/newlines. Markdown cares about blank lines and
  line breaks — this mismatch is fundamental and is the `layout`-pragma /
  "not context-free" problem from §0 showing up in practice.

---

## 11. Your exercises — build the Markdown grammar yourself

Don't write it all at once. Grow it in the order below, running BNFC after each
step. For each, I'm giving you the *question* and a *hint*, not the answer.

**Exercise A — the skeleton.**
A Markdown document is a sequence of blocks. What's your top-level category, and
which list pragma (§5) models "a document is a run of blocks with blank lines
between them"? Set your `entrypoints`.
*Hint:* look again at `separator` vs `terminator`, and at what separates blocks.

**Exercise B — headers.**
`# Title` through `###### Title`. How do you represent "one to six `#`"? Two
approaches: six explicit rules with distinct labels, or one `token` using the
regex language (§7) to match the run of `#`. Which gives you a cleaner AST for
Bridge's HTML output (you need to know the *level* to emit `<h1>`..`<h6>`)?
*Hint:* if the level must survive into the AST, a single node carrying the
count beats six unrelated labels.

**Exercise C — inline text and emphasis.**
A paragraph is a run of inline pieces: plain text, `**bold**`, `*italic*`. This
is where the difference operator `-` (§7) earns its keep: "text" is a run of
characters that are *not* `*`. Model bold as a node wrapping inline content
delimited by `**`. What precedence issue arises between `*` (italic) and `**`
(bold), and how do levels (§4) help?
*Hint:* your lexer must decide `**` vs `*` by maximal munch — think about
whether these are `token`s or literal terminals.

**Exercise D — lists.**
Unordered items begin with `-`, `*`, or `+` (see the `rules` pragma, §9). An
item's content is inline text. What's the list-of-items category, and what
happens to your grammar when you try to nest a list inside a list item?
*Hint:* this is exactly where you'll feel the "not context-free" wall from §0.
Note where it hurts — that observation is the real lesson.

**Exercise E — reflect.**
Write down (a) which parts of Markdown you *could* express and (b) which fought
back. That list is your spec for the hand-written TS parser: the clean parts
map directly to grammar-driven code, the messy parts need custom logic.

---

## 12. References

- **BNFC docs (LBNF report):** https://bnfc.digitalgrammars.com/ — the
  authoritative spec for every pragma and the regex language.
- **LBNF language reference (PDF/HTML):**
  https://bnfc.readthedocs.io/en/latest/lbnf.html
- **CommonMark spec:** https://spec.commonmark.org/ — read the intro to see
  *why* Markdown is specified as an algorithm. Sobering and instructive.
- **BNFC tutorial:** https://bnfc.readthedocs.io/en/latest/tutorial/ — walks
  the calculator example end to end.
- Your own notes: `bridge/lib/types.ts` already sketches `TokenType` and an AST
  — treat this grammar work as the formalization of those sketches.

---

## 13. Quick glossary

| Term          | Meaning                                                      |
|---------------|--------------------------------------------------------------|
| LBNF          | Labelled BNF — the grammar notation (this doc)               |
| BNFC          | BNF Converter — the tool that turns `.cf` into a parser      |
| Label         | Name of the AST node a rule builds (the `Foo` in `Foo.`)     |
| Category      | A non-terminal / "kind of thing" (`Exp`, `Document`)         |
| Terminal      | A literal quoted string in a rule (`"#"`, `"+"`)             |
| Coercion      | A label-`_` rule connecting precedence levels (no AST node)  |
| LALR(1)       | The parsing algorithm BNFC targets; 1 token of lookahead     |
| Pragma        | A grammar-level directive (`coercions`, `separator`, …)      |
