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
export type Block =
  | { kind: "H1"; text: string }
  | { kind: "H2"; text: string }
  | { kind: "H3"; text: string }
  | { kind: "H4"; text: string };

// A document is a sequence of blocks.
export type Document = Block[];


function parse(src: string): Document {
    const input = src.split("\n");
    ///

}
