import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { scopedStateKey, createScopedPersistedState } from "../src/client/runtime/state-scoped.ts";
import { inlineSurfaceId } from "../src/client/runtime/inline-fence.ts";
import { bindingImports, releaseBindings } from "../src/client/runtime/bindings.ts";

test("persisted keys are stable for the same surface and independent between cards and sessions", () => {
  const key = scopedStateKey("session-a", "inline:message-1:0", "todos");
  expect(scopedStateKey("session-a", "inline:message-1:0", "todos")).toBe(key);
  expect(scopedStateKey("session-a", "inline:message-1:1", "todos")).not.toBe(key);
  expect(scopedStateKey("session-b", "inline:message-1:0", "todos")).not.toBe(key);
  expect(scopedStateKey("session-a", "canvas:project", "todos")).not.toBe(key);
  expect(scopedStateKey("session-a", "inline:message-1:0", "notes")).not.toBe(key);
});

test("durable inline node keys select distinct stable surfaces", () => {
  expect(inlineSurfaceId("node-1", 0)).toBe("inline:node-1:0");
  expect(inlineSurfaceId("node-1", 0)).toBe(inlineSurfaceId("node-1", 0));
  expect(inlineSurfaceId("node-1", 1)).not.toBe(inlineSurfaceId("node-1", 0));
  expect(inlineSurfaceId("node-2", 0)).not.toBe(inlineSurfaceId("node-1", 0));
});

test("a scoped hook restores its own saved state without reading a sibling's value", () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const data = new Map<string, string>([[`dsh-genui:${scopedStateKey("s1", "inline:node-1:0", "todos")}`, '["persisted"]']]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) },
  });
  const render = (session: string, surface: string) => {
    let value: string[] = [];
    const useState = createScopedPersistedState(session, surface);
    renderToStaticMarkup(
      createElement(function Probe() {
        [value] = useState<string[]>("todos", []);
        return null;
      }),
    );
    return value;
  };
  try {
    expect(render("s1", "inline:node-1:0")).toEqual(["persisted"]);
    expect(render("s1", "inline:node-1:1")).toEqual([]);
    expect(render("s2", "inline:node-1:0")).toEqual([]);
    expect(render("s1", "inline:node-1:0")).toEqual(["persisted"]);
  } finally {
    if (old === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", old);
  }
});

test("generated capability imports are bound per surface, not only per session", () => {
  try {
    const first = bindingImports("session-a", "inline:message-1:0");
    const again = bindingImports("session-a", "inline:message-1:0");
    const sibling = bindingImports("session-a", "inline:message-1:1");
    const other = bindingImports("session-b", "inline:message-1:0");
    expect(first["$dsh/state"]).toBe(again["$dsh/state"]);
    expect(first["$dsh/state"]).not.toBe(sibling["$dsh/state"]);
    expect(first["$dsh/state"]).not.toBe(other["$dsh/state"]);
  } finally {
    releaseBindings();
  }
});
