import assert from "node:assert/strict";
import test from "node:test";

import { subscribeToLLMReady } from "../hooks/useLLMReady.js";
import { LLMManager } from "../services/llm.js";
import { eventBus, EVENTS } from "../utils/eventBus.js";

const savedConfig = {
  protocol: "openai",
  preset: "deepseek",
  apiKey: "test-key",
  model: "deepseek-chat",
};

function installSavedConfigStorage(): () => void {
  const originalChrome = typeof chrome === "undefined" ? undefined : chrome;
  const values: Record<string, unknown> = {
    gitmentor_llm_config: savedConfig,
    gitmentor_llm_configs_map: {},
  };
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          get: (keys: string | string[], callback: (data: Record<string, unknown>) => void) => {
            const requestedKeys = Array.isArray(keys) ? keys : [keys];
            callback(Object.fromEntries(requestedKeys.map((key) => [key, values[key]])));
          },
          set: (items: Record<string, unknown>, callback?: () => void) => {
            Object.assign(values, items);
            callback?.();
          },
          remove: (keys: string | string[], callback?: () => void) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
            callback?.();
          },
        },
      },
    },
  });
  return () => {
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: originalChrome,
    });
  };
}

test("LLM ready subscription registers listeners before checking current state", () => {
  const operations: string[] = [];
  const unsubscribe = subscribeToLLMReady(() => undefined, {
    isConfigured: () => {
      operations.push("check");
      return false;
    },
    onChanged: () => {
      operations.push("subscribe-change");
      return () => undefined;
    },
    onCleared: () => {
      operations.push("subscribe-clear");
      return () => undefined;
    },
  });

  assert.deepEqual(operations, ["subscribe-change", "subscribe-clear", "check"]);
  unsubscribe();
});

test("saved config restore emits readiness only after provider configuration succeeds", async () => {
  const restoreChrome = installSavedConfigStorage();
  const originalFetch = globalThis.fetch;
  let resolveFetch!: (response: Response) => void;
  globalThis.fetch = (() => new Promise<Response>((resolve) => {
    resolveFetch = resolve;
  })) as typeof fetch;

  let readyEvents = 0;
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const unsubscribe = eventBus.on(EVENTS.LLM_CONFIG_CHANGED, () => {
    readyEvents++;
    resolveReady();
  });

  try {
    const manager = Reflect.construct(LLMManager, []) as LLMManager;
    assert.equal(manager.isConfigured(), false);
    assert.equal(readyEvents, 0);

    resolveFetch(new Response("{}", { status: 200 }));
    await ready;

    assert.equal(manager.isConfigured(), true);
    assert.equal(readyEvents, 1);
  } finally {
    unsubscribe();
    globalThis.fetch = originalFetch;
    restoreChrome();
  }
});

test("failed saved config restore does not emit readiness", async () => {
  const restoreChrome = installSavedConfigStorage();
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let resolveRestoreFailure!: () => void;
  const restoreFailure = new Promise<void>((resolve) => {
    resolveRestoreFailure = resolve;
  });
  globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  console.warn = (...args: unknown[]) => {
    if (args[0] === "Failed to restore saved LLM config:") resolveRestoreFailure();
  };

  let readyEvents = 0;
  const unsubscribe = eventBus.on(EVENTS.LLM_CONFIG_CHANGED, () => readyEvents++);

  try {
    const manager = Reflect.construct(LLMManager, []) as LLMManager;
    await restoreFailure;

    assert.equal(manager.isConfigured(), false);
    assert.equal(readyEvents, 0);
  } finally {
    unsubscribe();
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
    restoreChrome();
  }
});

test("clearing config invalidates an in-flight saved config restore", async () => {
  const restoreChrome = installSavedConfigStorage();
  const originalFetch = globalThis.fetch;
  let resolveFetch!: (response: Response) => void;
  globalThis.fetch = (() => new Promise<Response>((resolve) => {
    resolveFetch = resolve;
  })) as typeof fetch;

  let readyEvents = 0;
  const unsubscribe = eventBus.on(EVENTS.LLM_CONFIG_CHANGED, () => readyEvents++);

  try {
    const manager = Reflect.construct(LLMManager, []) as LLMManager;
    await manager.clearConfig();
    resolveFetch(new Response("{}", { status: 200 }));
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(manager.isConfigured(), false);
    assert.equal(readyEvents, 0);
  } finally {
    unsubscribe();
    globalThis.fetch = originalFetch;
    restoreChrome();
  }
});
