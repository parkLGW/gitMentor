import assert from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

test("MarkdownDisplay keeps inline code visually lightweight", () => {
  const source = readFileSync("src/components/MarkdownDisplay.tsx", "utf8");

  assert.match(source, /bg-gray-100 text-gray-800/);
  assert.doesNotMatch(source, /<code className="bg-gray-900/);
});

test("MarkdownDisplay keeps dark styling only for fenced code blocks", () => {
  const source = readFileSync("src/components/MarkdownDisplay.tsx", "utf8");

  assert.match(source, /<pre className="bg-gray-900 text-green-400/);
  assert.match(source, /\[&_code\]:bg-transparent/);
});
