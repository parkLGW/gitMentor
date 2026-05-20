import assert from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

test("content script avoids runtime imports so Chrome can load it as a classic content script", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");
  const runtimeImports = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("import ") && !line.startsWith("import type "));

  assert.deepStrictEqual(runtimeImports, []);
});
