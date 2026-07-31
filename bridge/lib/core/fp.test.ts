import { test, expect } from "bun:test";
import { absurd, flow, pipe, unfold } from "./fp";

test("pipe threads a value left to right", () => {
  expect(
    pipe(
      "  hi  ",
      (s) => s.trim(),
      (s) => s.length,
    ),
  ).toBe(2);
});

test("flow builds a reusable function instead of running now", () => {
  const shout = flow(
    (s: string) => s.trim(),
    (s: string) => s.toUpperCase(),
    (s: string) => `${s}!`,
  );

  expect(shout(" hey ")).toBe("HEY!");
  expect(shout("ok")).toBe("OK!"); // reusable, holds no state
});

test("unfold grows a list from a seed", () => {
  const countdown = unfold<number, number>((n) =>
    n === 0 ? undefined : { emit: n, next: n - 1 },
  );

  expect(countdown(3)).toEqual([3, 2, 1]);
});

test("unfold steps may advance without emitting", () => {
  // Exactly how the lexer skips a blank line: consume input, emit nothing.
  const evensOnly = unfold<number, number>((n) =>
    n > 6 ? undefined : { emit: n % 2 === 0 ? n : undefined, next: n + 1 },
  );

  expect(evensOnly(1)).toEqual([2, 4, 6]);
});

test("absurd throws if a supposedly impossible case is reached", () => {
  // It should never run. When it does, it means a runtime value escaped the
  // type system (bad JSON, an `as` cast) — and you want to hear about it.
  expect(() => absurd("unexpected" as never)).toThrow(/Unhandled case/);
});
