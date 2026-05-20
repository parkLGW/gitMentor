import assert from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

test("AgentTab keeps the send action inside the input area and gives messages more height", () => {
  const source = readFileSync("src/components/AgentTab.tsx", "utf8");

  assert.match(source, /h-\[430px\]/);
  assert.match(source, /<form onSubmit=\{handleSubmit\} className="space-y-1"/);
  assert.match(source, /<div className="relative">/);
  assert.match(source, /pb-10 pr-12/);
  assert.match(source, /absolute bottom-2 right-2 h-8 w-8 rounded-full/);
});

test("AgentTab uses a shorter message area when the conversation is empty", () => {
  const source = readFileSync("src/components/AgentTab.tsx", "utf8");

  assert.match(source, /const hasConversationMessages = session\.recentMessages\.length > 0;/);
  assert.match(source, /hasConversationMessages \? "h-\[430px\]" : "h-\[220px\]"/);
});
