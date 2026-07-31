// Bridge — the entire "FP library" this project needs: four helpers.
//
// Resist adding more. Every helper here exists because the lexer, parser, or
// renderer would be harder to read without it. That's the only bar it has to
// clear. (fp-ts and Effect are the industrial versions — see
// docs/functional-parsing.md §10 for when to reach for them.)

// ---------------------------------------------------------------------------
// pipe — a value, then the functions it flows through
// ---------------------------------------------------------------------------
//
//   pipe("# Hi", parseDocument, toHtml)   reads top-to-bottom
//   toHtml(parseDocument("# Hi"))         reads inside-out
//
// Same computation; the first one reads in the order it happens.
//
// The overloads are the real contract: each one threads the types through, so
// `pipe(1, (n) => String(n), (s) => s.length)` is checked end to end and a
// mismatched link in the chain is a compile error. Add more overloads if you
// ever need longer chains.

export function pipe<A, B>(a: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
): D;
export function pipe<A, B, C, D, E>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): E;
// The implementation is untyped on purpose — it is invisible to callers, who
// only ever see the overloads above. This is the one place `any` earns its keep.
export function pipe(value: any, ...fns: ReadonlyArray<(x: any) => any>): any {
  return fns.reduce((acc, fn) => fn(acc), value);
}

// ---------------------------------------------------------------------------
// flow — pipe without the value: composes functions into a new function
// ---------------------------------------------------------------------------
//
//   const markdownToHtml = flow(parseDocument, toHtml)
//
// `pipe` is for "do this now"; `flow` is for "define the thing that does this".
// Reaching for `flow` is what lets you build a program out of named steps
// instead of nested calls.

export function flow<A, B, C>(ab: (a: A) => B, bc: (b: B) => C): (a: A) => C;
export function flow<A, B, C, D>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
): (a: A) => D;
export function flow<A, B, C, D, E>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): (a: A) => E;
export function flow<A, B, C, D, E, F>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
): (a: A) => F;
export function flow(...fns: ReadonlyArray<(x: any) => any>): (x: any) => any {
  return (value) => fns.reduce((acc, fn) => fn(acc), value);
}

// ---------------------------------------------------------------------------
// unfold — the opposite of reduce
// ---------------------------------------------------------------------------
//
// `reduce` folds a list down into one value. `unfold` grows a list *out of* one
// value by repeatedly asking a step function "what's next?". A lexer is exactly
// that shape: seed = the whole source string, and each step consumes a piece
// and maybe emits a token.
//
// A step may advance without emitting anything (skipping a blank line), so
// `emit` is optional. Returning `undefined` ends the list.
export type Step<S, A> = {
  readonly emit?: A;
  readonly next: S;
};

export const unfold =
  <S, A>(step: (state: S) => Step<S, A> | undefined) =>
  (seed: S): readonly A[] => {
    // This `while` is the one imperative core in Bridge, and it's deliberate.
    // The recursive version is prettier but JavaScript has no tail-call
    // elimination, so a long document would overflow the stack. Hide the loop
    // inside one small, well-tested function and everything built on top of it
    // still composes. "Functional at the seams" beats "recursive and fragile".
    const out: A[] = [];
    let state = seed;

    for (;;) {
      const result = step(state);
      if (!result) return out;
      if (result.emit !== undefined) out.push(result.emit);
      state = result.next;
    }
  };

// ---------------------------------------------------------------------------
// absurd — proof that a case cannot happen
// ---------------------------------------------------------------------------
//
// Put `default: return absurd(x)` at the end of a switch over a discriminated
// union. If every variant is handled, `x` has narrowed to `never` and this
// compiles. Add a variant to the union and forget a case, and `x` is no longer
// `never` — the build breaks, pointing at the exact switch you forgot.
//
// This is how you make the *compiler* maintain your parser as the grammar grows.
export const absurd = (value: never): never => {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
};
