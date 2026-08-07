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

test("parseGithubBlobPath decodes percent-encoded path segments so the raw URL is not double-encoded", () => {
  const parsed = parseGithubBlobPath(
    "/acme/widgets/blob/main/docs/%E8%AF%B4%E6%98%8E/My%20File.ts",
  );

  assert.deepEqual(parsed, {
    owner: "acme",
    repo: "widgets",
    branch: "main",
    path: "docs/说明/My File.ts",
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

test("content script remembers file-sidebar dismissal for the whole tab session and offers a collapsed reopen handle", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  // A per-file key made the close button look broken: the sidebar came back on
  // the very next file
  assert.match(
    source,
    /const DISMISSED_FILE_SIDEBAR_KEY = ['"]gitmentor:file-sidebar-dismissed['"]/,
  );
  assert.doesNotMatch(source, /dismissed-file-sidebar:\$\{/);
  assert.match(source, /gitmentor-file-sidebar-collapsed/);
});

test("content script gives the page back the space the file sidebar occupies", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  assert.match(source, /function reserveLayoutForSidebar/);
  assert.match(source, /body\.style\.paddingRight = `\$\{width\}px`/);
  // The sidebar used to be a hard-coded 380px overlay with no way to resize it
  assert.doesNotMatch(source, /width: 380px;/);
  assert.match(source, /cursor: col-resize/);
});

test("content script keeps the floating widget and the main panel clear of the sidebar", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  assert.match(source, /function keepWidgetClearOfSidebar/);
  assert.match(source, /setFileSidebarSuppressed\(true\)/);
  assert.match(source, /setFileSidebarSuppressed\(false\)/);
});

test("content script decodes the blob path and resolves branches containing slashes before fetching", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  // The old naive regex sent percent-encoded paths downstream, where
  // buildRawGithubUrl encoded them a second time and every non-ASCII file 404ed
  assert.doesNotMatch(source, /blob\\\/\(\[\^\\\/\]\+\)/);
  assert.match(source, /decodeURIComponent/);
  assert.match(source, /collectBranchHints/);
});

test("content script keys the file sidebar by repo and branch, not by path alone", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  assert.doesNotMatch(source, /currentFilePath/);
  assert.match(source, /function getFileKey\(fileInfo: FileInfo\): string \{[\s\S]*?fileInfo\.owner[\s\S]*?fileInfo\.repo[\s\S]*?fileInfo\.branch[\s\S]*?fileInfo\.path/);
});

test("content script renders the file path as text so decoded paths cannot inject markup", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  assert.doesNotMatch(source, /innerHTML[\s\S]{0,400}\$\{fileInfo\.path\}/);
  assert.match(source, /headerPath\.textContent = fileInfo\.path/);
});

test("content script guards the quick-question path against an invalidated extension context", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");
  const renderQuestionAnswer = source.slice(
    source.indexOf("function renderQuestionAnswer"),
    source.indexOf("function renderFileInsight"),
  );

  // Otherwise sendMessage throws synchronously and the "thinking" placeholder
  // is the last thing the user ever sees
  assert.match(renderQuestionAnswer, /isExtensionContextValid\(\)/);
  assert.match(renderQuestionAnswer, /catch \(error\)/);
  assert.ok(
    renderQuestionAnswer.indexOf("isExtensionContextValid()") <
      renderQuestionAnswer.indexOf("getText('thinking')"),
    "the context check must run before the placeholder is rendered",
  );
});

test("content script measures the whole file locally and only caps what the model receives", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  // Truncating before measuring made Lines/LOC/Imports/TODOs wrong for every
  // file over the cap, with nothing in the UI saying so
  assert.match(
    source,
    /buildFileLocalInsight\(fileData\.fileName, fileData\.fileContent, currentLanguage\)/,
  );
  assert.doesNotMatch(source, /fileContent: fileData\.fileContent/);
  assert.equal(source.match(/fileContent: fileData\.promptContent/g)?.length, 2);
  assert.match(source, /promptTruncated/);
});

test("file sidebar symbols and local dependencies jump to their line in the open file", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  assert.match(source, /jumpToFileLine\(symbol\.lineStart, insight\.totalLines\)/);
  assert.match(source, /jumpToFileLine\(item\.lineStart, insight\.totalLines\)/);
  // External packages are not somewhere the reader can navigate to, so they stay flat
  assert.match(source, /if \(!isLocalDependency\(item\.source\)\) \{[\s\S]{0,120}createChip\(item\.source, 'gray'\)/);
});

test("file sidebar computes the line position instead of relying on GitHub's anchor", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  // Verified against the live blob view: it virtualises its lines, so no element
  // for the target line exists, and assigning location.hash after load scrolls
  // nowhere — while an unmatched fragment bounces the page to the top
  assert.doesNotMatch(source, /window\.location\.hash = /);
  assert.match(source, /history\.replaceState\(null, '', `#L\$\{lineNumber\}`\)/);
  assert.match(source, /function readBlobLineGeometry/);
  assert.match(source, /rect\.height \/ totalLines/);
});

test("content script line counting matches the canonical file-insights rule", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");
  const canonical = readFileSync("src/services/file-insights.ts", "utf8");

  const rule = /lines\.length > 1 && lines\[lines\.length - 1\] === ["']["']\) lines\.pop\(\)/;
  assert.match(source, rule);
  assert.match(canonical, rule);
});

test("file sidebar renders answers as Markdown instead of raw text", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  // Answers arrived as Markdown and were dumped with textContent, so ** and
  // backticks showed up literally next to the code they described
  assert.match(source, /renderMarkdownInto\(answer, qaResult\.answer\)/);
  assert.doesNotMatch(source, /answer\.textContent = qaResult\.answer/);
  assert.match(source, /function appendMarkdownList/);
});

test("file sidebar never turns model output into a live link", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");
  const renderer = source.slice(
    source.indexOf("function createInlineMarkdownNode"),
    source.indexOf("function renderMarkdownInto"),
  );

  assert.doesNotMatch(renderer, /createElement\('a'\)/);
  assert.match(renderer, /createTextNode\(`\$\{label\} \(\$\{url\}\)`\)/);
});

test("file sidebar keeps each question with its answer instead of replacing it", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");
  const qa = source.slice(
    source.indexOf("function renderQuestionAnswer"),
    source.indexOf("function renderFileInsight"),
  );

  // A second question used to wipe the first answer, leaving prose with nothing
  // to attach it to
  assert.match(qa, /asked\.textContent = question/);
  assert.match(qa, /target\.appendChild\(entry\)/);
  assert.doesNotMatch(qa, /target\.replaceChildren/);
});

test("sidebar hands a question to the Agent rather than growing a second chat", () => {
  const content = readFileSync("src/content/content-script.ts", "utf8");
  const app = readFileSync("src/popup/App.tsx", "utf8");
  const agent = readFileSync("src/components/AgentTab.tsx", "utf8");

  assert.match(content, /initialTab\?: 'settings' \| 'agent'/);
  assert.match(content, /openPanel\(fileInfo\.owner, fileInfo\.repo, 'agent', seeded\)/);
  assert.match(content, /&q=\$\{encodeURIComponent\(initialQuestion\.slice\(0, 500\)\)\}/);
  assert.match(app, /function getInitialQuestion/);
  assert.match(app, /initialQuestion=\{initialQuestion\}/);
  // Prefilled, never auto-sent: spending a model call stays the reader's choice
  assert.match(agent, /useState\(initialQuestion \?\? ""\)/);
});

test("file sidebar states each fact once", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");

  // The path was in the sticky header and again in a mono box below it; Lines
  // and LOC were chips and again metric tiles under 40px of each other
  assert.doesNotMatch(source, /path\.textContent = insight\.filePath/);
  assert.doesNotMatch(source, /function createMetric/);
  assert.doesNotMatch(source, /getText\('metrics'\)/);
  // A one-letter badge instead of a "function"/"interface" chip, which crowded
  // the already-ellipsised symbol name at the 280px minimum width
  assert.match(source, /function createSymbolBadge/);
  assert.doesNotMatch(source, /createChip\(symbol\.kind/);
});

test("file sidebar translation table has no orphaned keys", () => {
  const source = readFileSync("src/content/content-script.ts", "utf8");
  const table = source.slice(
    source.indexOf("const uiTranslations"),
    source.indexOf("type UITranslationKey"),
  );
  const keys = new Set(
    Array.from(table.matchAll(/^\s{4}(\w+):/gm), (match) => match[1]),
  );

  assert.ok(keys.size > 0, "expected to parse some translation keys");
  const unused = [...keys].filter((key) => !source.includes(`getText('${key}')`));
  assert.deepEqual(unused, []);
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
