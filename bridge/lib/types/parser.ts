// Bridge — AST types, hand-translated from ../grammar.cf.
// Each labelled rule in the grammar becomes one variant below.

// H1 . Block ::= "#" Text ;
// H2 . Block ::= "##" Text ;
// H3 . Block ::= "###" Text ;
// H4 . Block ::= "####" Text ;
//
// "A Block is one of four things" -> a discriminated union.
// The `kind` field is the label; `text` is what the `Text` in the production
// captures.
//
// `readonly` on every field is the cheapest functional guarantee there is: an
// AST that can't be mutated can be shared, cached, and compared freely, and no
// later pass can secretly rewrite an earlier one's output.
export type Block =
  | { readonly kind: "H1"; readonly text: string }
  | { readonly kind: "H2"; readonly text: string }
  | { readonly kind: "H3"; readonly text: string }
  | { readonly kind: "H4"; readonly text: string };

// A document is a sequence of blocks. `readonly Block[]` for the same reason:
// consumers can `map`/`filter` (which return new arrays) but not `push`.
export type Document = readonly Block[];
