# AI Settings Protocolization Design

Date: 2026-04-12
Project: GitMentor
Status: Draft approved in chat, pending user review of written spec

## Goal

Rework the AI settings experience from a vendor-first model into a protocol-first model so the extension can support:

- OpenAI-compatible endpoints
- Claude-compatible endpoints
- Local APIs
- Official vendor presets without exposing every vendor as a top-level provider

This should reduce UI complexity while making self-hosted, proxied, and third-party endpoints easier to configure.

## Non-Goals

- No custom header editor in this iteration
- No custom path overrides beyond protocol-specific base URL handling
- No fully generic "arbitrary protocol" engine
- No advanced per-preset parameter editor

## User Experience

The settings page should become a two-step configuration flow:

1. Choose a connection type
2. Choose a preset template within that type

Primary connection types:

- `OpenAI-compatible`
- `Claude-compatible`
- `Local API`

Preset templates:

- `OpenAI-compatible`
  - `OpenAI official`
  - `DeepSeek`
  - `SiliconFlow`
  - `Zhipu`
  - `Custom`
- `Claude-compatible`
  - `Anthropic official`
  - `Custom`
- `Local API`
  - `Ollama`
  - `LM Studio`
  - `Custom local endpoint`

The selected template pre-fills:

- base URL
- recommended model
- API key requirement mode
- help text

The user can still override the model and base URL manually.

## Information Architecture

Replace the current single `provider` abstraction with two layers:

- `protocol`
  - `openai`
  - `claude`
  - `local`
- `preset`
  - identifies a concrete template under a protocol

Protocol determines request format.
Preset determines defaults and UX hints.

This separates transport behavior from branding.

## Data Model

Persist a normalized config shape similar to:

```ts
interface LLMConfigV2 {
  protocol: 'openai' | 'claude' | 'local'
  preset: string
  apiKey: string
  model?: string
  baseUrl?: string
  localMode?: 'ollama' | 'openai-compatible'
  temperature?: number
  maxTokens?: number
}
```

Compatibility requirement:

- Existing saved configs using the legacy `provider` field must be migrated automatically on read.
- Migration should preserve API key, model, and base URL wherever possible.

Example mapping:

- `openai` -> `protocol=openai`, `preset=openai-official`
- `custom` -> `protocol=openai`, `preset=custom`
- `claude` -> `protocol=claude`, `preset=anthropic-official`
- `ollama` -> `protocol=local`, `preset=ollama`, `localMode=ollama`
- `lmstudio` -> `protocol=local`, `preset=lmstudio`, `localMode=openai-compatible`
- `deepseek` -> `protocol=openai`, `preset=deepseek`
- `siliconflow` -> `protocol=openai`, `preset=siliconflow`
- `zhipu` -> `protocol=openai`, `preset=zhipu`

## Runtime Architecture

Reduce runtime transport implementations to three main protocol handlers:

- `OpenAICompatibleProvider`
- `ClaudeCompatibleProvider`
- `LocalProvider`

### OpenAICompatibleProvider

Handles:

- OpenAI official
- DeepSeek
- SiliconFlow
- Zhipu
- custom OpenAI-compatible gateways
- LM Studio style local endpoints when routed through `LocalProvider`

Behavior:

- uses `/v1/chat/completions`
- supports streaming
- falls back to non-streaming when stream support is broken at gateway level

### ClaudeCompatibleProvider

Handles:

- Anthropic official
- custom Claude-compatible endpoints

Behavior:

- uses Anthropic messages format
- official preset uses Anthropic base URL
- custom preset allows overriding base URL
- should support non-streaming as baseline
- streaming support should be implemented when endpoint compatibility is confirmed; if incompatible, degrade gracefully to non-streaming

### LocalProvider

Handles:

- Ollama
- LM Studio
- custom local endpoint

Behavior:

- protocol-specific branching is internal to local mode
- `ollama` uses Ollama API semantics
- `openai-compatible` uses local OpenAI-compatible semantics

## Settings Page Behavior

### Field rendering

Form rendering is driven by protocol and preset metadata rather than vendor type checks.

Fields:

- connection type selector
- preset selector
- API key input
- model input
- base URL input when supported

API key modes:

- `required`
- `optional`
- `none`

### Switching behavior

When connection type changes:

- default to the first preset in that type
- reset help text and default values

When preset changes:

- replace untouched default values with the preset defaults
- preserve user-entered values when they diverge from the previous default

### Testing behavior

Connection testing must validate the real protocol capability, not only model discovery.

- OpenAI-compatible: minimal `chat/completions` request
- Claude-compatible: minimal `messages` request
- Local API: protocol-specific minimal request

This avoids false positives where `/models` works but chat or stream endpoints fail.

## Preset Metadata

Introduce schema describing:

- protocol
- preset id
- label
- description
- default model
- default base URL
- API key mode
- docs URL
- local mode if applicable
- stream support assumptions

This metadata powers:

- settings UI
- default filling
- validation
- migration mapping

## Error Handling

### Settings page

- show protocol-aware validation messages
- fail early for missing required fields
- keep optional API key support for unauthenticated custom gateways

### Runtime

- stream failures that indicate gateway incompatibility should fall back to non-streaming where safe
- preserve explicit failures for normal client errors such as invalid key or invalid model
- avoid masking genuine request errors behind generic "failed" states

## Storage and Clearing

Clearing config should remain scoped to the selected saved configuration and should remove the migrated V2 record consistently.

Requirements:

- clearing current selection should not wipe unrelated saved presets
- clearing an active config should also clear active runtime state
- migrated legacy entries should not reappear after clearing

## Testing Strategy

Required coverage:

- protocol/preset metadata selection
- legacy provider to protocol/preset migration
- OpenAI-compatible base URL normalization
- Claude-compatible custom base URL normalization
- stream fallback behavior for compatible gateway failures
- settings form behavior when switching connection type and preset
- clear/save/load flows with migrated configs

Verification commands during implementation:

- targeted node-based tests for pure helpers
- `npm run type-check`
- `npm run build`

## Implementation Plan Boundary

This spec covers one implementation track:

- protocol-first settings model
- template-driven vendor presets
- Claude-compatible custom endpoint support
- vendor preset consolidation
- legacy config migration

It does not include advanced custom headers or arbitrary protocol plugins, which can be considered later if needed.

## Risks and Mitigations

Risk: legacy configs may stop loading correctly.
Mitigation: add explicit migration helpers and regression tests for every current provider.

Risk: local APIs are not one protocol.
Mitigation: keep `LocalProvider` as a dedicated wrapper with explicit local mode.

Risk: custom Claude-compatible endpoints may not fully support Anthropic streaming.
Mitigation: treat non-streaming success as baseline and degrade stream behavior safely.

## Open Questions Resolved

- Top-level settings should be protocol-first, not vendor-first.
- Vendor-specific options such as DeepSeek, SiliconFlow, and Zhipu should appear as templates, not as top-level choices.
- Claude-compatible support should be added as a first-class protocol alongside OpenAI-compatible.
