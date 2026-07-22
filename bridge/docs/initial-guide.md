# LBNF Basics — a starter reference

A compact, get-familiar-with-the-syntax reference for **LBNF** (Labelled
Backus–Naur Form). This is the "what does each symbol mean" companion to the
deeper [`lbnf-guide.md`](./lbnf-guide.md). Read this first to learn the
notation; go there for the *why* and for the Markdown exercises.

---

## 1. The shape of every rule

An LBNF grammar is just a list of **labelled rules**. Every rule has the same
four-part shape:

```
Label . Category ::= production ;
```

```
H1 . Block ::= "#" Text ;
     └┬─┘   └────┬────┘
    category  production
 └┬┘
 label
```

| Part           | Example       | Meaning                                             |
|----------------|---------------|-----------------------------------------------------|
| **Label**      | `H1`          | Name of the AST node this rule builds. You invent it. |
| **Category**   | `Block`       | The "kind of thing" being defined (a non-terminal). |
| `::=`          | `::=`         | "is defined as"                                     |
| **Production** | `"#" Text`    | The sequence to match (terminals + categories).     |
| `;`            | `;`           | Ends the rule. **Required.**                        |

Three quick truths that clear up most beginner confusion:

- The **label is a name you invent** — it means nothing to the tool, only to
  your downstream code that reads the AST. `H1` could be `Foo`.
- The **category *is* the capitalized word** between `.` and `::=`. There's no
  separate "declare a category" step — using it defines it.
- **Terminals are quoted** (`"#"`); **categories are bare and capitalized**
  (`Text`). That capitalization is how the tool tells them apart.

---

## 2. Terminals vs. categories

```
Greet . Hello ::= "hello" Name ;
```

- `"hello"` — a **terminal**: literal text that must appear exactly.
- `Name` — a **category**: a placeholder filled by another rule.

Anything in `"quotes"` is matched literally. Anything capitalized and unquoted
is a reference to another category (which you must define somewhere, unless
it's a built-in — §6).

---

## 3. Alternatives — same category, many rules

To say "an X can be this **or** that," write several rules with the **same
category** on the left and **different labels**:

```
TrueLit  . Bool ::= "true" ;
FalseLit . Bool ::= "false" ;
```

Read: *"A `Bool` is either `true` (label `TrueLit`) or `false` (label
`FalseLit`)."* Each label distinguishes which branch matched.

---

## 4. Sequences — juxtaposition

A production is just a **sequence** — list the parts in order, separated by
spaces. No commas, no operators:

```
Assign . Stmt ::= Ident "=" Exp ";" ;
```

Matches an identifier, then `=`, then an expression, then `;`.

---

## 5. Recursion — how you get structure

A category may refer to **itself**, directly or indirectly. This is how trees
are built:

```
ENum . Exp ::= Integer ;
EAdd . Exp ::= Exp "+" Exp ;
```

`EAdd` contains two `Exp`s — so `1 + 2 + 3` nests into a tree. (Real grammars
add *precedence levels* to control the nesting; that's in the deeper guide, §4.)

---

## 6. Built-in categories

Predefined — use them without declaring:

| Category  | Matches                                             |
|-----------|-----------------------------------------------------|
| `Integer` | integer literals, e.g. `42`                         |
| `Double`  | floating point, e.g. `3.14`                         |
| `String`  | double-quoted strings, e.g. `"hi"`                  |
| `Char`    | single-quoted characters, e.g. `'a'`                |
| `Ident`   | identifiers: a letter, then letters/digits/`_`/`'`  |

---

## 7. Comments in a `.cf` file

```
-- line comment, from -- to end of line
{- block comment,
   spanning lines -}
```

(These are comments in the *grammar file itself*. Telling the parser what to
skip in the *input* language is a different pragma — §9.)

---

## 8. The special labels

Two labels have built-in meaning:

| Label | Meaning                                                              |
|-------|---------------------------------------------------------------------|
| `_`   | "Build **no** AST node." Pure plumbing — used for coercions (§9).   |
| `[]`  | The empty list (nil).                                               |
| `(:)` | Cons — one item followed by the rest of a list.                     |

You rarely write `[]` / `(:)` by hand; the list pragmas (§9) generate them.

---

## 9. Pragmas — grammar-level directives

Pragmas are shortcuts and settings. The ones to know early:

```
entrypoints Document ;        -- where parsing starts
separator   Item "," ;        -- a list of Items separated by commas: a, b, c
terminator  Stmt ";" ;        -- a list where each item is followed by ; : a; b;
coercions   Exp 2 ;           -- auto-generate precedence plumbing (see §4 of the deep guide)
comment     "//" ;            -- skip // ... in the *input* being parsed
comment     "/*" "*/" ;       -- skip block comments in the input
token       Word (letter+) ;  -- define your own token via a regex (see §7 of the deep guide)
rules       Bullet ::= "-" | "*" | "+" ; -- shorthand for several one-terminal rules
```

- **`separator` / `terminator`** save you from writing `[]` / `(:)` by hand.
  Add `nonempty` to forbid the empty list: `separator nonempty Item "," ;`.
- **`entrypoints`** defaults to the first category if omitted.
- **`token`** and **`coercions`** are covered in depth in the main guide.

---

## 10. A complete tiny grammar

Everything above, together. This parses a single variable declaration like
`let x = 42 ;`:

```
-- JsVar.cf

DLet   . Decl  ::= "let"   Ident "=" Value ";" ;
DConst . Decl  ::= "const" Ident "=" Value ";" ;
DVar   . Decl  ::= "var"   Ident "=" Value ";" ;

VNum . Value ::= Integer ;
VStr . Value ::= String ;

entrypoints Decl ;
```

- `Decl` is a category with three alternatives (`let` / `const` / `var`), each
  with its own label.
- `Ident`, `Integer`, `String` are built-ins (§6).
- `Value` is your own category with two shapes.
- Input `let x = 42 ;` produces the tree `DLet(Ident "x", VNum 42)`.

The AST this describes, in TypeScript terms:

```ts
type Decl =
  | { kind: "DLet";   name: string; value: Value }
  | { kind: "DConst"; name: string; value: Value }
  | { kind: "DVar";   name: string; value: Value };

type Value =
  | { kind: "VNum"; value: number }
  | { kind: "VStr"; value: string };
```

The grammar and the AST are the same thing said twice — that's the whole point
of the "L" (labelled) in LBNF.

---

## 11. Cheat sheet

```
Label . Category ::= production ;   -- the one rule shape
"literal"                           -- terminal (quoted)
Category                            -- non-terminal (capitalized, bare)
Foo . C ::= ... ;  Bar . C ::= ...  -- alternatives share a category
_ . A ::= B ;                       -- coercion: build no node
-- ...   {- ... -}                  -- comments in the .cf file
entrypoints C ;                     -- start category
separator  C "," ;                  -- list, delimiter between
terminator C ";" ;                  -- list, delimiter after each
Integer Double String Char Ident    -- built-in categories
```

---

## 12. Where to go next

- **[`lbnf-guide.md`](./lbnf-guide.md)** — the deep guide: precedence levels,
  the token regex mini-language, layout/indentation, pitfalls, and the graded
  Markdown exercises for Bridge.
- **BNFC LBNF reference:** https://bnfc.readthedocs.io/en/latest/lbnf.html
