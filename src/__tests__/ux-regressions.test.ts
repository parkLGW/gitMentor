import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildGithubBlobUrl,
  parseGithubBlobPath,
} from "../services/github-url.js";
import { resolveInitialLanguagePreference } from "../services/language-preference.js";

test("parseGithubBlobPath handles branch names containing slashes when a branch hint is available", () => {
  const parsed = parseGithubBlobPath(
    "/acme/widgets/blob/feature/auth-flow/src/app.ts",
    ["feature/auth-flow"],
  );

  assert.deepEqual(parsed, {
    owner: "acme",
    repo: "widgets",
    branch: "feature/auth-flow",
    path: "src/app.ts",
  });
});

test("parseGithubBlobPath falls back to the legacy one-segment branch parse without hints", () => {
  const parsed = parseGithubBlobPath("/acme/widgets/blob/main/src/app.ts");

  assert.deepEqual(parsed, {
    owner: "acme",
    repo: "widgets",
    branch: "main",
    path: "src/app.ts",
  });
});

test("buildGithubBlobUrl uses the repo default branch and safely encodes branch and path segments", () => {
  const url = buildGithubBlobUrl(
    { owner: "acme", name: "widgets" },
    "docs/README #1.md",
    "feature/auth-flow",
    12,
  );

  assert.equal(
    url,
    "https://github.com/acme/widgets/blob/feature%2Fauth-flow/docs/README%20%231.md#L12",
  );
});

test("resolveInitialLanguagePreference preserves an existing user preference", () => {
  assert.deepEqual(
    resolveInitialLanguagePreference({
      savedLanguage: "zh",
      legacyLanguage: "en",
      browserLanguage: "en-US",
    }),
    {
      language: "zh",
      shouldPersist: false,
    },
  );
});

test("resolveInitialLanguagePreference initializes from browser language only when no preference exists", () => {
  assert.deepEqual(
    resolveInitialLanguagePreference({
      browserLanguage: "zh-CN",
    }),
    {
      language: "zh",
      shouldPersist: true,
    },
  );
});

test("content script fetches GitHub file content through the extension runtime so saved tokens can be reused", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  assert.match(source, /action:\s*['"]fetchGithubFileContent['"]/);
  assert.doesNotMatch(source, /https:\/\/api\.github\.com\/repos\/\$\{fileInfo\.owner\}/);
});

test("content script remembers file-sidebar dismissal for the current file and offers a collapsed reopen handle", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  assert.match(source, /dismissedFileSidebarKey/);
  assert.match(source, /gitmentor-file-sidebar-collapsed/);
});

test("Source Map and security audit file links do not hard-code the main branch", () => {
  const sourceMap = readFileSync("src/components/SourceMapTab.tsx", "utf8");
  const securityAudit = readFileSync("src/components/SecurityAuditTab.tsx", "utf8");

  assert.doesNotMatch(sourceMap, /blob\/\$\{defaultBranch\}/);
  assert.doesNotMatch(securityAudit, /blob\/main/);
});

test("LearningMission does not render a button inside another button", () => {
  const source = readFileSync("src/components/LearningMission.tsx", "utf8");

  assert.match(source, /role="button"/);
  assert.doesNotMatch(
    source,
    /<button\s+[\s\S]*?onClick=\{\(\) => setExpandedStep[\s\S]*?<button/,
  );
});
