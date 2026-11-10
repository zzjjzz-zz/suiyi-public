import { afterEach, expect, test } from "bun:test";
import { Context } from "@deepseek-ai/cordis";
import { createVisualOutput } from "../src/client/visual-output.ts";
import { resetVisualRuntimeConfig } from "../src/client/runtime/isolated-frame.ts";
import { disposeVisualInstances, registerVisualInstance } from "../src/client/runtime/instances.ts";

const restore: (() => void)[] = [];
const contexts: Context[] = [];
afterEach(async () => {
  while (restore.length > 0) restore.pop()!();
  for (const context of contexts.splice(0)) await context.fiber.dispose();
  disposeVisualInstances();
});

const browserDocument = (): void => {
  const had = Object.hasOwn(globalThis, "document");
  const previous = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {};
  restore.push(() => {
    if (had) (globalThis as { document?: unknown }).document = previous;
    else delete (globalThis as { document?: unknown }).document;
  });
};

const stubRuntime = (isolation: "iframe-opaque" | "same-realm", allowExec = false, allowData = false, settingsNamespace?: string) => {
  const real = globalThis.fetch;
  restore.push(() => {
    globalThis.fetch = real;
  });
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ version: 1, isolation, allowExec, allowData, ai: false, settingsNamespace }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
};

/** A Host volatile form stub: the provider must read and write this, never storage. */
const form = (initial: boolean) => {
  let value: boolean | undefined = initial;
  const listeners = new Set<() => void>();
  const notify = () => {
    // eslint-disable-next-line unicorn/no-useless-spread -- Match the production observable's publication snapshot.
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => ({ status: "ready" as const, value: { visualOutput: value }, base: undefined, user: undefined, revision: 1, writable: true }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: async (field: string, next: unknown) => {
      if (field !== "visualOutput") return false;
      value = next === true;
      notify();
      return true;
    },
  };
};

const context = (options: { connection?: unknown; form?: ReturnType<typeof form> | null }): Context => {
  const ctx = new Context();
  contexts.push(ctx);
  if (options.connection !== undefined) ctx.provide("connection", options.connection as never);
  if (options.form) ctx.provide("configForms", { get: () => options.form } as never);
  return ctx;
};

test("reads and writes the actual profile entry namespace published by the Host", async () => {
  resetVisualRuntimeConfig();
  browserDocument();
  stubRuntime("iframe-opaque", false, false, "generative-ui");
  const connection = { generation: { getSnapshot: () => ({ id: "account-a" }), subscribe: () => () => {} } };
  const hostForm = form(false);
  const missingForm = { ...form(false), getSnapshot: () => ({ status: "unavailable", value: undefined }) };
  const namespaces: string[] = [];
  const ctx = context({ connection });
  ctx.provide("configForms", { get: (namespace: string) => {
    namespaces.push(namespace);
    return namespace === "generative-ui" ? hostForm : missingForm;
  } } as never);
  let reachedReady!: () => void;
  const ready = new Promise<void>((resolve) => { reachedReady = resolve; });
  const { capability, dispose } = createVisualOutput(ctx, (_enabled, isReady) => { if (isReady) reachedReady(); });
  restore.push(dispose);
  await ready;
  expect(namespaces).toEqual(["dsh-generative-ui", "generative-ui"]);
  expect(capability.readiness.getSnapshot()).toEqual({ ready: true });
  expect(await capability.setEnabled(true)).toBe(true);
  expect(hostForm.getSnapshot().value.visualOutput).toBe(true);
});
test("a same-realm runtime is never ready", async () => {
  resetVisualRuntimeConfig();
  browserDocument();
  stubRuntime("same-realm");
  const { capability, dispose } = createVisualOutput(context({ form: form(false) }), () => {});
  restore.push(dispose);
  await Bun.sleep(10);
  expect(capability.readiness.getSnapshot()).toEqual({ ready: false, reason: "isolation" });
  expect(await capability.setEnabled(true)).toBe(false);
  expect(capability.enabled.getSnapshot()).toBe(false);
});

test("a connection and a ready Host form are both required", async () => {
  resetVisualRuntimeConfig();
  browserDocument();
  stubRuntime("iframe-opaque");
  const connection = { generation: { getSnapshot: () => ({ id: "account-a" }), subscribe: () => () => {} } };
  const noForm = createVisualOutput(context({ connection }), () => {});
  restore.push(noForm.dispose);
  await Bun.sleep(10);
  expect(noForm.capability.readiness.getSnapshot()).toEqual({ ready: false, reason: "permission" });

  const noConnection = createVisualOutput(context({ form: form(false) }), () => {});
  restore.push(noConnection.dispose);
  await Bun.sleep(10);
  expect(noConnection.capability.readiness.getSnapshot()).toEqual({ ready: false, reason: "permission" });
});

test("the Host form is the single source of the preference", async () => {
  resetVisualRuntimeConfig();
  browserDocument();
  stubRuntime("iframe-opaque");
  const connection = { generation: { getSnapshot: () => ({ id: "account-a" }), subscribe: () => () => {} } };
  const hostForm = form(false);
  const seen: boolean[] = [];
  const { capability, dispose } = createVisualOutput(context({ connection, form: hostForm }), (enabled) => seen.push(enabled));
  restore.push(dispose);
  await Bun.sleep(10);
  expect(capability.readiness.getSnapshot()).toEqual({ ready: true });
  expect(capability.enabled.getSnapshot()).toBe(false);
  expect(await capability.setEnabled(true)).toBe(true);
  expect(hostForm.getSnapshot().value?.visualOutput).toBe(true);
  expect(capability.enabled.getSnapshot()).toBe(true);
  expect(seen.at(-1)).toBe(true);
  expect(await capability.setEnabled(false)).toBe(true);
  expect(hostForm.getSnapshot().value?.visualOutput).toBe(false);
});

test("an accepted Host write is the value a reloaded provider reads", async () => {
  resetVisualRuntimeConfig();
  browserDocument();
  stubRuntime("iframe-opaque");
  const connection = { generation: { getSnapshot: () => ({ id: "account-a" }), subscribe: () => () => {} } };
  const hostForm = form(false);
  const first = createVisualOutput(context({ connection, form: hostForm }), () => {});
  await Bun.sleep(10);
  expect(await first.capability.setEnabled(true)).toBe(true);
  first.dispose();
  resetVisualRuntimeConfig();
  const reloaded = createVisualOutput(context({ connection, form: hostForm }), () => {});
  restore.push(reloaded.dispose);
  await Bun.sleep(10);
  expect(reloaded.capability.enabled.getSnapshot()).toBe(true);
  expect(reloaded.capability.readiness.getSnapshot()).toEqual({ ready: true });
});

test("withdrawing and replacing the connection republishes readiness", async () => {
  resetVisualRuntimeConfig();
  browserDocument();
  stubRuntime("iframe-opaque");
  const ctx = new Context();
  contexts.push(ctx);
  const first = { generation: { getSnapshot: () => ({ id: "a" }), subscribe: () => () => {} } };
  const stopConnection = ctx.provide("connection", first as never);
  ctx.provide("configForms", { get: () => form(false) } as never);
  const { capability } = createVisualOutput(ctx, () => {});
  await Bun.sleep(10);
  expect(capability.readiness.getSnapshot()).toEqual({ ready: true });
  stopConnection();
  await ctx.fiber.await();
  expect(capability.readiness.getSnapshot()).toEqual({ ready: false, reason: "permission" });
  const second = { generation: { getSnapshot: () => ({ id: "b" }), subscribe: () => () => {} } };
  ctx.provide("connection", second as never);
  await ctx.fiber.await();
  expect(capability.readiness.getSnapshot()).toEqual({ ready: true });
});

test("an account generation change tears down every live instance", async () => {
  resetVisualRuntimeConfig();
  browserDocument();
  stubRuntime("iframe-opaque");
  let generation: unknown = { id: "a" };
  let notify = () => {};
  const connection = {
    generation: {
      getSnapshot: () => generation,
      subscribe: (listener: () => void) => {
        notify = listener;
        return () => {};
      },
    },
  };
  const { capability } = createVisualOutput(context({ connection, form: form(false) }), () => {});
  await Bun.sleep(10);
  let disposed = 0;
  const unregister = registerVisualInstance(() => {
    disposed += 1;
  });
  notify();
  expect(disposed).toBe(1);
  notify();
  expect(disposed).toBe(1);
  expect(capability.readiness.getSnapshot()).toEqual({ ready: true });
  generation = undefined;
  notify();
  expect(capability.readiness.getSnapshot()).toEqual({ ready: false, reason: "permission" });
  unregister();
});

test("rechecks isolation after a failed startup fetch when the authenticated connection changes", async () => {
  resetVisualRuntimeConfig();
  browserDocument();
  const real = globalThis.fetch;
  restore.push(() => { globalThis.fetch = real; });
  let calls = 0;
  let available = false;
  globalThis.fetch = async () => {
    calls += 1;
    if (!available) throw new TypeError("connection reset");
    return new Response(JSON.stringify({ isolation: "iframe-opaque", allowExec: false, allowData: false, ai: false }));
  };
  let changed = () => {};
  const connection = { generation: {
    getSnapshot: () => ({ id: "same-user-reconnected" }),
    subscribe: (listener: () => void) => { changed = listener; return () => {}; },
  } };
  const { capability, dispose } = createVisualOutput(context({ connection, form: form(true) }), () => {});
  restore.push(dispose);
  await Bun.sleep(10);
  expect(capability.readiness.getSnapshot()).toEqual({ ready: false, reason: "isolation" });
  const failedCalls = calls;
  available = true;
  changed();
  await Bun.sleep(10);
  expect(capability.readiness.getSnapshot()).toEqual({ ready: true });
  expect(capability.enabled.getSnapshot()).toBe(true);
  expect(calls).toBe(failedCalls + 1);
});
