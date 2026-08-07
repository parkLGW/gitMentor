import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEEP_ANALYSIS_CACHE_TTL_MS,
  buildDeepAnalysisCacheKey,
  isDeepAnalysisCacheKey,
  readFreshEntry,
  selectEvictableKeys,
} from "../services/deep-analysis-cache.js";

const ref = {
  owner: "acme",
  repo: "widgets",
  branch: "main",
  path: "src/app.ts",
};

test("cache key separates repo, branch, path, language, and file content", () => {
  const base = buildDeepAnalysisCacheKey(ref, "zh", "const a = 1");

  assert.ok(isDeepAnalysisCacheKey(base));
  assert.notEqual(base, buildDeepAnalysisCacheKey(ref, "en", "const a = 1"));
  assert.notEqual(
    base,
    buildDeepAnalysisCacheKey({ ...ref, branch: "next" }, "zh", "const a = 1"),
  );
  assert.notEqual(
    base,
    buildDeepAnalysisCacheKey({ ...ref, repo: "gadgets" }, "zh", "const a = 1"),
  );
  // The analysis describes one revision of the file, so an edit must miss
  assert.notEqual(base, buildDeepAnalysisCacheKey(ref, "zh", "const a = 2"));
  assert.equal(base, buildDeepAnalysisCacheKey(ref, "zh", "const a = 1"));
});

test("readFreshEntry accepts fresh entries and rejects stale or malformed ones", () => {
  const now = 1_000_000_000;

  assert.deepEqual(
    readFreshEntry<{ role: string }>({ data: { role: "entry" }, timestamp: now }, now),
    { role: "entry" },
  );
  assert.deepEqual(
    readFreshEntry({ data: { role: "entry" }, timestamp: now - DEEP_ANALYSIS_CACHE_TTL_MS - 1 }, now),
    null,
  );
  assert.equal(readFreshEntry(undefined, now), null);
  assert.equal(readFreshEntry({ data: { a: 1 } }, now), null);
  assert.equal(readFreshEntry({ timestamp: now }, now), null);
  assert.equal(readFreshEntry("not an object", now), null);
});

test("selectEvictableKeys drops the oldest beyond the limit and nothing else", () => {
  const stored: Record<string, unknown> = {
    gitmentor_llm_config: { keep: true },
    other_extension_key: { keep: true },
  };
  for (let i = 0; i < 5; i += 1) {
    stored[buildDeepAnalysisCacheKey(ref, "en", `file-${i}`)] = {
      data: {},
      timestamp: i,
    };
  }

  const evicted = selectEvictableKeys(stored, 3);

  assert.equal(evicted.length, 2);
  assert.ok(evicted.every((key) => isDeepAnalysisCacheKey(key)));
  // Oldest first: timestamps 0 and 1
  assert.deepEqual(
    evicted.sort(),
    [
      buildDeepAnalysisCacheKey(ref, "en", "file-0"),
      buildDeepAnalysisCacheKey(ref, "en", "file-1"),
    ].sort(),
  );
  assert.deepEqual(selectEvictableKeys(stored, 10), []);
});

test("deep analysis is cached and the sidebar can get back to the structure", () => {
  const worker = readFileSync("src/background/service-worker.ts", "utf8");
  const content = readFileSync("src/content/content-script.ts", "utf8");

  // Every other analysis in the extension caches; this one re-billed a full
  // model call each time the reader came back to the file
  assert.match(worker, /readCachedDeepAnalysis\(cacheKey\)/);
  assert.match(worker, /writeCachedDeepAnalysis\(cacheKey, data\)/);
  assert.match(worker, /if \(!message\.refresh\)/);

  // localStorage does not exist in a service worker, so this cache uses
  // chrome.storage.local rather than the localStorage-backed local-cache module
  assert.match(worker, /chrome\.storage\.local\.set\(\{ \[key\]: \{ data, timestamp/);

  assert.match(content, /function createBackToStructureButton/);
  assert.doesNotMatch(content, /performDeepAnalysis\(container,/);
  assert.match(content, /if \(aiView\.childElementCount > 0\)/);
});
