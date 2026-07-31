import { test, expect } from "bun:test";
import { escapeHtml, markdownToHtml, renderBlock, toHtml } from "./html";

test("each header level renders its own tag", () => {
  expect(
    toHtml([
      { kind: "H1", text: "One" },
      { kind: "H2", text: "Two" },
      { kind: "H3", text: "Three" },
      { kind: "H4", text: "Four" },
    ]),
  ).toBe("<h1>One</h1>\n<h2>Two</h2>\n<h3>Three</h3>\n<h4>Four</h4>");
});

test("renderBlock handles one node, toHtml handles the sequence", () => {
  expect(renderBlock({ kind: "H3", text: "Alone" })).toBe("<h3>Alone</h3>");
});

test("text -> AST -> HTML, end to end", () => {
  expect(markdownToHtml("# Title\n\n## Subtitle")).toBe(
    "<h1>Title</h1>\n<h2>Subtitle</h2>",
  );
});

test("header text is escaped, not injected", () => {
  expect(markdownToHtml("# <script>alert(1)</script>")).toBe(
    "<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>",
  );
});

test("ampersand is escaped first, so escapes are not double-escaped", () => {
  // The bug this pins down: escaping `&` last would turn the `&` of `&lt;` into
  // `&amp;lt;`, and the page would show the literal text "&lt;".
  expect(escapeHtml("a & b")).toBe("a &amp; b");
  expect(escapeHtml("<a>")).toBe("&lt;a&gt;");
  expect(escapeHtml('"')).toBe("&quot;");
});

test("an empty document renders as an empty string", () => {
  expect(toHtml([])).toBe("");
});
