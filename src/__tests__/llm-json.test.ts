import assert from "node:assert";
import test from "node:test";

import { parseLooseJson } from "../services/llm-json.js";

test("parseLooseJson parses JSON surrounded by model prose", () => {
  const parsed = parseLooseJson(`
Here is the analysis:
{
  "summary": "This file builds project memory paths.",
  "components": [
    {"name": "get_project_memory_dir", "type": "function", "description": "Builds the directory"}
  ],
  "dependencies": ["pathlib"],
  "confidence": "high"
}
Hope this helps.
`);

  assert.deepStrictEqual(parsed, {
    summary: "This file builds project memory paths.",
    components: [
      {
        name: "get_project_memory_dir",
        type: "function",
        description: "Builds the directory",
      },
    ],
    dependencies: ["pathlib"],
    confidence: "high",
  });
});

test("parseLooseJson skips non-JSON braces before the real object", () => {
  const parsed = parseLooseJson(`
The code contains blocks like function demo() { return true; }.

\`\`\`json
{
  "summary": "Actual analysis",
  "dependencies": ["react"],
}
\`\`\`
`);

  assert.deepStrictEqual(parsed, {
    summary: "Actual analysis",
    dependencies: ["react"],
  });
});

test("parseLooseJson prefers a populated object over earlier empty braces", () => {
  const parsed = parseLooseJson(`
Use an empty options object like {} when defaults are fine.

{
  "summary": "Actual populated object",
  "confidence": "medium"
}
`);

  assert.deepStrictEqual(parsed, {
    summary: "Actual populated object",
    confidence: "medium",
  });
});
