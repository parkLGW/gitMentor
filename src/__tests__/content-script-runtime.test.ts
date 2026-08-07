import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";

// MV3 loads content scripts as classic scripts. An `import` surviving into the
// bundle makes the whole script fail to evaluate — silently, with nothing on the
// page and nothing in the console — so the output format is the thing to guard.
// This used to be enforced by banning imports from the source, which cost the
// file ~300 lines of copied logic it could not share with the rest of the app.

test("content script is built as an IIFE, separately from the module bundles", () => {
  const contentConfig = readFileSync("vite.content.config.js", "utf8");
  const mainConfig = readFileSync("vite.config.js", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(contentConfig, /formats:\s*\[['"]iife['"]\]/);
  assert.match(contentConfig, /content-script\.ts/);
  // Rollup's format is per build, so the content script cannot share the build
  // that emits the popup and the module service worker
  assert.doesNotMatch(mainConfig, /'content-script':\s*path\.resolve/);
  assert.match(pkg.scripts.build, /--config vite\.content\.config\.js/);
});

test("built content script parses as a classic script with no ESM syntax", (t) => {
  if (!existsSync("dist/content-script.js")) {
    t.skip("dist/content-script.js not built");
    return;
  }

  const bundle = readFileSync("dist/content-script.js", "utf8");

  assert.doesNotMatch(bundle, /^\s*(import|export)\s/m);
  assert.match(bundle, /^\(function\(\)\{/);
  // Throws on `import`/`export` at the top level, which is exactly the failure
  // Chrome would hit
  assert.doesNotThrow(() => new Script(bundle));
});
