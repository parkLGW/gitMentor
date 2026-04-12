# AI Settings Protocolization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert AI settings from vendor-first providers to protocol-first configuration with preset templates, including Claude-compatible custom endpoints and consolidated local/API options.

**Architecture:** Keep runtime behavior driven by three protocol handlers: OpenAI-compatible, Claude-compatible, and Local API. Move vendor distinctions into preset metadata plus a migration layer so existing saved configs continue to work while the UI changes to `connection type + preset template`.

**Tech Stack:** React, TypeScript, Chrome extension storage APIs, Vite build, node-based helper tests

---

## File Structure

- Modify: `src/types/llm.ts`
  - Replace legacy provider-centric config shape with protocol/preset-aware types while keeping a compatibility path for migrated configs.
- Modify: `src/services/llm-provider-config.ts`
  - Convert provider metadata into protocol/preset metadata for settings rendering, defaults, validation, and docs links.
- Create: `src/services/llm-config-migration.ts`
  - Normalize legacy saved configs into the new protocol-first config shape.
- Create: `src/services/claude-compatible-utils.ts`
  - Hold reusable helpers for custom Claude-compatible base URL resolution and stream fallback decisions.
- Modify: `src/services/llm-base.ts`
  - Replace vendor-specific custom logic with `OpenAICompatibleProvider`, `ClaudeCompatibleProvider`, and `LocalProvider`.
- Modify: `src/services/llm.ts`
  - Load migrated configs, instantiate protocol handlers, and clear/save migrated config records consistently.
- Modify: `src/background/service-worker.ts`
  - Route background AI calls through protocol-first request building.
- Modify: `src/components/SettingsTab.tsx`
  - Render the new `connection type + preset` form and preserve per-selection state.
- Modify: `src/services/usage-tracker.ts`
  - Preserve model-based tracking after migration and ensure no assumptions depend on legacy provider names.
- Create: `src/__tests__/llm-config-migration.test.ts`
  - Verify old provider configs migrate into the new protocol/preset shape.
- Modify: `src/__tests__/llm-provider-config.test.ts`
  - Update metadata tests to validate protocols and preset defaults instead of top-level vendor providers.
- Create: `src/__tests__/claude-compatible-utils.test.ts`
  - Verify Claude-compatible base URL normalization and fallback decisions.
- Modify: `src/__tests__/custom-openai-utils.test.ts`
  - Keep stream fallback coverage aligned with protocol-first OpenAI-compatible behavior.

### Task 1: Add Protocol/Preset Types and Migration Helpers

**Files:**
- Modify: `src/types/llm.ts`
- Create: `src/services/llm-config-migration.ts`
- Create: `src/__tests__/llm-config-migration.test.ts`

- [ ] **Step 1: Write the failing migration test**

```ts
import assert from 'node:assert/strict'

import { migrateLegacyLLMConfig } from '../services/llm-config-migration.js'

function runTest(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

runTest('migrates deepseek legacy provider to openai protocol preset', () => {
  const migrated = migrateLegacyLLMConfig({
    provider: 'deepseek',
    apiKey: 'sk-test',
    model: 'deepseek-chat',
  })

  assert.equal(migrated.protocol, 'openai')
  assert.equal(migrated.preset, 'deepseek')
  assert.equal(migrated.apiKey, 'sk-test')
})

runTest('migrates lmstudio legacy provider to local openai-compatible mode', () => {
  const migrated = migrateLegacyLLMConfig({
    provider: 'lmstudio',
    apiKey: '',
    model: 'local-model',
    baseUrl: 'http://localhost:1234',
  })

  assert.equal(migrated.protocol, 'local')
  assert.equal(migrated.preset, 'lmstudio')
  assert.equal(migrated.localMode, 'openai-compatible')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-plan-tests src/services/llm-config-migration.ts src/__tests__/llm-config-migration.test.ts`

Expected: FAIL with `Cannot find module '../services/llm-config-migration.js'` before implementation exists.

- [ ] **Step 3: Add protocol-first config types**

```ts
export type LLMProtocolType = 'openai' | 'claude' | 'local'

export type LLMPresetType =
  | 'openai-official'
  | 'deepseek'
  | 'siliconflow'
  | 'zhipu'
  | 'custom-openai'
  | 'anthropic-official'
  | 'custom-claude'
  | 'ollama'
  | 'lmstudio'
  | 'custom-local'

export interface LLMConfig {
  protocol: LLMProtocolType
  preset: LLMPresetType
  apiKey: string
  model?: string
  baseUrl?: string
  localMode?: 'ollama' | 'openai-compatible'
  temperature?: number
  maxTokens?: number
}

export interface LegacyLLMConfig {
  provider:
    | 'claude'
    | 'openai'
    | 'custom'
    | 'ollama'
    | 'deepseek'
    | 'lmstudio'
    | 'zhipu'
    | 'siliconflow'
  apiKey: string
  model?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
}
```

- [ ] **Step 4: Implement migration helper**

```ts
import { LLMConfig, LegacyLLMConfig } from '../types/llm.js'

export function migrateLegacyLLMConfig(
  config: LegacyLLMConfig | LLMConfig,
): LLMConfig {
  if ('protocol' in config && 'preset' in config) {
    return config
  }

  switch (config.provider) {
    case 'openai':
      return { protocol: 'openai', preset: 'openai-official', apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl }
    case 'custom':
      return { protocol: 'openai', preset: 'custom-openai', apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl }
    case 'deepseek':
      return { protocol: 'openai', preset: 'deepseek', apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl }
    case 'siliconflow':
      return { protocol: 'openai', preset: 'siliconflow', apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl }
    case 'zhipu':
      return { protocol: 'openai', preset: 'zhipu', apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl }
    case 'claude':
      return { protocol: 'claude', preset: 'anthropic-official', apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl }
    case 'ollama':
      return { protocol: 'local', preset: 'ollama', localMode: 'ollama', apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl }
    case 'lmstudio':
      return { protocol: 'local', preset: 'lmstudio', localMode: 'openai-compatible', apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-plan-tests src/types/llm.ts src/services/llm-config-migration.ts src/__tests__/llm-config-migration.test.ts
node .tmp-plan-tests/__tests__/llm-config-migration.test.js
```

Expected:

```text
PASS migrates deepseek legacy provider to openai protocol preset
PASS migrates lmstudio legacy provider to local openai-compatible mode
```

- [ ] **Step 6: Commit**

```bash
git add src/types/llm.ts src/services/llm-config-migration.ts src/__tests__/llm-config-migration.test.ts
git commit -m "refactor: add protocol-first LLM config migration"
```

### Task 2: Convert Metadata from Providers to Protocols and Presets

**Files:**
- Modify: `src/services/llm-provider-config.ts`
- Modify: `src/__tests__/llm-provider-config.test.ts`
- Create: `src/services/claude-compatible-utils.ts`
- Create: `src/__tests__/claude-compatible-utils.test.ts`
- Modify: `src/__tests__/custom-openai-utils.test.ts`

- [ ] **Step 1: Write the failing metadata and Claude helper tests**

```ts
import assert from 'node:assert/strict'

import {
  getProtocolOptions,
  getPresetOptions,
  normalizeClaudeCompatibleBaseUrl,
} from '../services/llm-provider-config.js'

function runTest(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

runTest('lists Claude-compatible as a top-level protocol', () => {
  const protocols = getProtocolOptions()
  assert.equal(protocols.some((entry) => entry.value === 'claude'), true)
})

runTest('lists vendor presets under openai protocol instead of top-level providers', () => {
  const presets = getPresetOptions('openai')
  assert.deepEqual(
    presets.map((entry) => entry.value),
    ['openai-official', 'deepseek', 'siliconflow', 'zhipu', 'custom-openai'],
  )
})

runTest('normalizes Claude-compatible base URLs without forcing v1', () => {
  assert.equal(
    normalizeClaudeCompatibleBaseUrl('https://example.com/messages///'),
    'https://example.com/messages',
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-plan-tests src/services/llm-provider-config.ts src/services/claude-compatible-utils.ts src/__tests__/llm-provider-config.test.ts src/__tests__/claude-compatible-utils.test.ts
```

Expected: FAIL because the new protocol/preset helpers do not exist yet.

- [ ] **Step 3: Replace provider metadata with protocol/preset metadata**

```ts
export interface ProtocolOption {
  value: LLMProtocolType
  label: { zh: string; en: string }
  description: { zh: string; en: string }
}

export interface PresetOption {
  value: LLMPresetType
  protocol: LLMProtocolType
  label: { zh: string; en: string }
  description: { zh: string; en: string }
  defaultModel: string
  defaultBaseUrl: string
  apiKeyMode: ApiKeyMode
  localMode?: 'ollama' | 'openai-compatible'
  docsUrl?: string
}

export function getProtocolOptions(): ProtocolOption[] {
  return PROTOCOL_OPTIONS
}

export function getPresetOptions(protocol: LLMProtocolType): PresetOption[] {
  return PRESET_OPTIONS.filter((preset) => preset.protocol === protocol)
}
```

- [ ] **Step 4: Add Claude-compatible normalization helper**

```ts
export function normalizeClaudeCompatibleBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

export function resolveClaudeCompatibleBaseUrl(baseUrl?: string): string {
  return normalizeClaudeCompatibleBaseUrl(baseUrl || '')
}
```

- [ ] **Step 5: Update OpenAI fallback helper test names to protocol language**

```ts
runTest('falls back to non-streaming for OpenAI-compatible bad gateway responses', () => {
  assert.equal(shouldFallbackCustomStreaming(502), true)
})
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-plan-tests src/services/llm-provider-config.ts src/services/claude-compatible-utils.ts src/services/custom-openai-utils.ts src/__tests__/llm-provider-config.test.ts src/__tests__/claude-compatible-utils.test.ts src/__tests__/custom-openai-utils.test.ts
node .tmp-plan-tests/__tests__/llm-provider-config.test.js
node .tmp-plan-tests/__tests__/claude-compatible-utils.test.js
node .tmp-plan-tests/__tests__/custom-openai-utils.test.js
```

Expected:

```text
PASS lists Claude-compatible as a top-level protocol
PASS lists vendor presets under openai protocol instead of top-level providers
PASS normalizes Claude-compatible base URLs without forcing v1
PASS falls back to non-streaming for OpenAI-compatible bad gateway responses
```

- [ ] **Step 7: Commit**

```bash
git add src/services/llm-provider-config.ts src/services/claude-compatible-utils.ts src/services/custom-openai-utils.ts src/__tests__/llm-provider-config.test.ts src/__tests__/claude-compatible-utils.test.ts src/__tests__/custom-openai-utils.test.ts
git commit -m "refactor: add protocol and preset metadata"
```

### Task 3: Refactor Runtime Providers to Protocol Handlers

**Files:**
- Modify: `src/services/llm-base.ts`
- Modify: `src/services/llm.ts`
- Modify: `src/background/service-worker.ts`
- Test: `src/__tests__/custom-openai-utils.test.ts`
- Test: `src/__tests__/claude-compatible-utils.test.ts`

- [ ] **Step 1: Write the failing runtime contract test as a helper-level assertion**

```ts
runTest('normalizes custom Claude-compatible base URLs for runtime use', () => {
  assert.equal(
    resolveClaudeCompatibleBaseUrl('https://gateway.example.com/anthropic/'),
    'https://gateway.example.com/anthropic',
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-plan-tests src/services/claude-compatible-utils.ts src/__tests__/claude-compatible-utils.test.ts
```

Expected: FAIL before the helper is wired into runtime code and exported correctly.

- [ ] **Step 3: Replace vendor-specific runtime registrations**

```ts
private initializeProviders(): void {
  this.providers.set('openai', new OpenAICompatibleProvider())
  this.providers.set('claude', new ClaudeCompatibleProvider())
  this.providers.set('local', new LocalProvider())
}
```

- [ ] **Step 4: Implement protocol-aware request routing**

```ts
switch (config.protocol) {
  case 'openai':
    apiUrl = `${resolveOpenAICompatibleBaseUrl(config)}/chat/completions`
    break
  case 'claude':
    apiUrl = `${resolveClaudeApiUrl(config)}`
    break
  case 'local':
    apiUrl = resolveLocalApiUrl(config)
    break
}
```

- [ ] **Step 5: Implement Claude-compatible provider behavior**

```ts
export class ClaudeCompatibleProvider extends BaseLLMProvider {
  name = 'Claude-compatible API'
  type = 'claude' as const

  async complete(prompt: string, systemPrompt?: string, signal?: AbortSignal): Promise<LLMResponse> {
    const config = this.getConfig()
    const apiUrl = resolveClaudeMessagesUrl(config)
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: buildClaudeHeaders(config),
      body: JSON.stringify({
        model: config.model || 'claude-3-5-sonnet-latest',
        max_tokens: config.maxTokens || 2000,
        system: this.createSystemPrompt(systemPrompt),
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Claude-compatible API error: ${errorData.error?.message || response.statusText}`)
    }

    const data = await response.json()
    return {
      content: data.content?.[0]?.text || '',
      model: data.model || config.model || 'claude-3-5-sonnet-latest',
      tokensUsed: {
        prompt: data.usage?.input_tokens || 0,
        completion: data.usage?.output_tokens || 0,
        total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    }
  }
}
```

- [ ] **Step 6: Run verification**

Run:

```bash
npm run type-check
```

Expected:

```text
> git-mentor@0.1.0 type-check
> tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/services/llm-base.ts src/services/llm.ts src/background/service-worker.ts src/services/claude-compatible-utils.ts
git commit -m "refactor: switch runtime to protocol handlers"
```

### Task 4: Refactor Settings UI to Connection Type + Preset

**Files:**
- Modify: `src/components/SettingsTab.tsx`
- Modify: `src/services/llm.ts`
- Modify: `src/services/llm-provider-config.ts`
- Test: `src/__tests__/llm-provider-config.test.ts`

- [ ] **Step 1: Write the failing settings metadata assertion**

```ts
runTest('returns local presets for local protocol', () => {
  const presets = getPresetOptions('local')
  assert.deepEqual(
    presets.map((entry) => entry.value),
    ['ollama', 'lmstudio', 'custom-local'],
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-plan-tests src/services/llm-provider-config.ts src/__tests__/llm-provider-config.test.ts
```

Expected: FAIL until the new preset inventory is exposed.

- [ ] **Step 3: Update settings state shape**

```ts
const [selectedProtocol, setSelectedProtocol] = useState<LLMProtocolType>('openai')
const [selectedPreset, setSelectedPreset] = useState<LLMPresetType>('openai-official')
```

- [ ] **Step 4: Render connection type and preset selectors**

```tsx
<select value={selectedProtocol} onChange={(e) => setSelectedProtocol(e.target.value as LLMProtocolType)}>
  {protocolOptions.map((opt) => (
    <option key={opt.value} value={opt.value}>{opt.label[language]}</option>
  ))}
</select>

<select value={selectedPreset} onChange={(e) => setSelectedPreset(e.target.value as LLMPresetType)}>
  {presetOptions.map((opt) => (
    <option key={opt.value} value={opt.value}>{opt.label[language]}</option>
  ))}
</select>
```

- [ ] **Step 5: Save protocol-first config**

```ts
const config: LLMConfig = {
  protocol: selectedProtocol,
  preset: selectedPreset,
  apiKey: trimmedApiKey,
  model: trimmedModel || undefined,
  baseUrl: resolvedBaseUrl || undefined,
  localMode: selectedPreset === 'ollama' ? 'ollama' : selectedProtocol === 'local' ? 'openai-compatible' : undefined,
}
```

- [ ] **Step 6: Run verification**

Run:

```bash
npm run type-check
```

Expected:

```text
> git-mentor@0.1.0 type-check
> tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/components/SettingsTab.tsx src/services/llm-provider-config.ts src/services/llm.ts src/__tests__/llm-provider-config.test.ts
git commit -m "feat: convert AI settings to protocol and preset selectors"
```

### Task 5: Finish Migration, Clearing, and Full Verification

**Files:**
- Modify: `src/services/llm.ts`
- Modify: `src/services/usage-tracker.ts`
- Modify: `src/background/service-worker.ts`
- Test: `src/__tests__/llm-config-migration.test.ts`
- Test: `src/__tests__/llm-provider-config.test.ts`
- Test: `src/__tests__/claude-compatible-utils.test.ts`
- Test: `src/__tests__/custom-openai-utils.test.ts`

- [ ] **Step 1: Write the failing migration regression assertion**

```ts
runTest('keeps custom base URL when migrating custom provider', () => {
  const migrated = migrateLegacyLLMConfig({
    provider: 'custom',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
    baseUrl: 'https://gateway.example.com/v1',
  })

  assert.equal(migrated.protocol, 'openai')
  assert.equal(migrated.preset, 'custom-openai')
  assert.equal(migrated.baseUrl, 'https://gateway.example.com/v1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-plan-tests src/types/llm.ts src/services/llm-config-migration.ts src/__tests__/llm-config-migration.test.ts
```

Expected: FAIL if migration output does not preserve custom base URLs or preset naming.

- [ ] **Step 3: Finalize storage and clearing behavior**

```ts
async clearConfig(selection?: { protocol: LLMProtocolType; preset: LLMPresetType }): Promise<void> {
  const savedMap = await readConfigMap()
  const nextMap = savedMap.filter((entry) => {
    if (!selection) return false
    return entry.protocol !== selection.protocol || entry.preset !== selection.preset
  })

  await writeConfigMap(nextMap)

  const activeConfig = await readActiveConfig()
  if (
    !selection ||
    (
      activeConfig?.protocol === selection.protocol &&
      activeConfig?.preset === selection.preset
    )
  ) {
    await clearActiveConfig()
    this.currentProvider = null
  }
}
```

- [ ] **Step 4: Run full verification**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-plan-tests src/types/llm.ts src/services/llm-config-migration.ts src/services/llm-provider-config.ts src/services/claude-compatible-utils.ts src/services/custom-openai-utils.ts src/__tests__/llm-config-migration.test.ts src/__tests__/llm-provider-config.test.ts src/__tests__/claude-compatible-utils.test.ts src/__tests__/custom-openai-utils.test.ts
node .tmp-plan-tests/__tests__/llm-config-migration.test.js
node .tmp-plan-tests/__tests__/llm-provider-config.test.js
node .tmp-plan-tests/__tests__/claude-compatible-utils.test.js
node .tmp-plan-tests/__tests__/custom-openai-utils.test.js
npm run type-check
npm run build
```

Expected:

```text
PASS migrates deepseek legacy provider to openai protocol preset
PASS migrates lmstudio legacy provider to local openai-compatible mode
PASS lists Claude-compatible as a top-level protocol
PASS falls back to non-streaming for OpenAI-compatible bad gateway responses
> git-mentor@0.1.0 type-check
> tsc --noEmit
> git-mentor@0.1.0 build
> vite build && node fix-manifest.js
```

- [ ] **Step 5: Commit**

```bash
git add src/services/llm.ts src/services/usage-tracker.ts src/background/service-worker.ts src/__tests__/llm-config-migration.test.ts src/__tests__/llm-provider-config.test.ts src/__tests__/claude-compatible-utils.test.ts src/__tests__/custom-openai-utils.test.ts
git commit -m "feat: finalize protocol-first AI settings migration"
```
