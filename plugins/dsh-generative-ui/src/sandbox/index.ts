/**
 * Offline sandbox runtime entry.
 *
 * Bundled by the package build: React,
 * React DOM, partial-react and its compiler all live in one ESM artifact, so the
 * opaque frame needs no CDN request at all. The frame's CSP denies every network
 * source; generated code can import this bundle's React family and the `$dsh/*`
 * blobs this module mints, and nothing else.
 *
 * The module also exports the React namespaces it bundled. Small blob modules
 * (React family, capabilities, persisted state) import these exports by this
 * module's own URL, which is how generated code reaches the frame's one React
 * instance without an import map pointing at a remote host.
 */
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as jsxDevRuntime from "react/jsx-dev-runtime";
import * as ReactDom from "react-dom";
import * as ReactDomClient from "react-dom/client";
import * as Scheduler from "scheduler";
import { GenUIRenderer } from "partial-react";

const RUNTIME_URL = import.meta.url;

let port: MessagePort | null = null;
let renderer: GenUIRenderer | null = null;
let ensurePromise: Promise<GenUIRenderer> | null = null;
let root: HTMLElement | null = null;
let nextCall = 0;
let generation = 0;
let detached = false;
const calls = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const persisted = new Map<string, unknown>();
const blobs: string[] = [];

type CapabilityGroups = Record<string, readonly string[]>;
type InitMessage = {
  type: "ui4a:init";
  preserveState?: boolean;
  capabilities?: CapabilityGroups;
  state?: Record<string, unknown>;
};

const post = (message: Record<string, unknown>): void => {
  if (port !== null) port.postMessage(message);
};

export { React, jsxRuntime, jsxDevRuntime, ReactDom, ReactDomClient, Scheduler };

/** Capability modules are local blobs; they call back over the parent-owned port. */
function capabilityImports(groups: CapabilityGroups): Record<string, string> {
  const imports: Record<string, string> = {};
  for (const group of Object.keys(groups)) {
    const members = groups[group] ?? [];
    let body = `import { call } from ${JSON.stringify(RUNTIME_URL)};\n`;
    for (const member of members) {
      body += `export const ${member} = (...args) => call(${JSON.stringify(group)}, ${JSON.stringify(member)}, args);\n`;
    }
    body += `export default { ${members.join(", ")} };`;
    const url = URL.createObjectURL(new Blob([body], { type: "text/javascript" }));
    blobs.push(url);
    imports[`$dsh/${group}`] = url;
  }
  return imports;
}

/** `usePersistedState` needs this frame's React instance, so it imports this module's export. */
function stateImport(): string {
  const url = URL.createObjectURL(
    new Blob(
      [
        `import { React, persistedGet, persistedSet } from ${JSON.stringify(RUNTIME_URL)};`,
        "export function usePersistedState(key, initial) {",
        "  const [value, setValue] = React.useState(() => persistedGet(key, initial));",
        "  React.useEffect(() => { persistedSet(key, value); }, [key, value]);",
        "  return [value, setValue];",
        "}",
        "export default { usePersistedState };",
      ],
      { type: "text/javascript" },
    ),
  );
  blobs.push(url);
  return url;
}

export function persistedGet(key: string, initial: unknown): unknown {
  return persisted.has(key) ? persisted.get(key) : initial;
}

export function persistedSet(key: string, value: unknown): void {
  persisted.set(key, value);
  post({ type: "state", key, value });
}

const serializable = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(serializable);
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "signal") continue;
    copy[key] = serializable(item);
  }
  return copy;
};

/** One RPC request. Signals cannot cross a port, so abort becomes a separate message. */
export function call(group: string, member: string, args: unknown[]): Promise<unknown> {
  const id = ++nextCall;
  const signal = args.find((arg): arg is { signal: AbortSignal } => arg !== null && typeof arg === "object" && (arg as { signal?: unknown }).signal instanceof AbortSignal)?.signal;
  signal?.addEventListener("abort", () => post({ type: "abort", id }), { once: true });
  return new Promise((resolve, reject) => {
    calls.set(id, { resolve, reject });
    post({ type: "call", id, group, member, args: serializable(args) });
  });
}

const fail = (id: number, error: { message?: string; code?: string; denied?: boolean }): void => {
  const pending = calls.get(id);
  if (pending === undefined) return;
  calls.delete(id);
  pending.reject(Object.assign(new Error(error.message ?? "capability failed"), { code: error.code, denied: error.denied }));
};

const succeed = (id: number, value: unknown): void => {
  const pending = calls.get(id);
  if (pending === undefined) return;
  calls.delete(id);
  pending.resolve(value);
};

function namespaceModule(namespace: Record<string, unknown>, exported: string): string {
  let body = `import { ${exported} } from ${JSON.stringify(RUNTIME_URL)};\n`;
  for (const name of Object.keys(namespace)) {
    if (name === "default" || !/^[A-Za-z_$][\w$]*$/.test(name)) continue;
    body += `export const ${name} = ${exported}.${name};\n`;
  }
  body += "export default {};";
  const url = URL.createObjectURL(new Blob([body], { type: "text/javascript" }));
  blobs.push(url);
  return url;
}

/** One document import map, installed before the first generated module is imported. */
function installImportMap(imports: Record<string, string>): void {
  const script = document.createElement("script");
  script.type = "importmap";
  script.textContent = JSON.stringify({ imports });
  document.head.appendChild(script);
}

function start(data: InitMessage): void {
  for (const [key, value] of Object.entries(data.state ?? {})) persisted.set(key, value);
  const capabilities = data.capabilities ?? {};
  const imports: Record<string, string> = { ...capabilityImports(capabilities), "$dsh/state": stateImport() };
  // The React family is local blobs exporting this bundle's own namespaces, so
  // generated code shares the exact instance partial-react renders with.
  const asRecord = (value: object): Record<string, unknown> => value as Record<string, unknown>;
  Object.assign(imports, {
    react: namespaceModule(asRecord(React), "React"),
    "react/jsx-runtime": namespaceModule(asRecord(jsxRuntime), "jsxRuntime"),
    "react/jsx-dev-runtime": namespaceModule(asRecord(jsxDevRuntime), "jsxDevRuntime"),
    "react-dom": namespaceModule(asRecord(ReactDom), "ReactDom"),
    "react-dom/client": namespaceModule(asRecord(ReactDomClient), "ReactDomClient"),
    scheduler: namespaceModule(asRecord(Scheduler), "Scheduler"),
  });
  installImportMap(imports);
  // The runtime owns its mount node, so the document carries no pre-styled
  // container the generated tree could inherit from.
  const host = document.createElement("div");
  host.className = "ui4a-root";
  host.style.containerType = "inline-size";
  document.body.appendChild(host);
  root = host;
  let buffer = "";
  const ensureRenderer = (): Promise<GenUIRenderer> => {
    if (detached) return Promise.reject(new Error("surface detached"));
    if (ensurePromise !== null) return ensurePromise;
    const createdFor = generation;
    ensurePromise = GenUIRenderer.create(root, {
      importmap: { imports },
      preserveStateOnUpdate: data.preserveState !== false,
      callbacks: {
        onError: (error, phase) => post({ type: "error", message: error.message, phase }),
        onRendered: (_component, source) => post({ type: "rendered", source }),
      },
    }).then((created) => {
      if (detached || createdFor !== generation) {
        created.detach();
        throw new Error("surface detached");
      }
      renderer = created;
      return created;
    }).catch((error: unknown) => {
      ensurePromise = null;
      throw error;
    });
    return ensurePromise;
  };
  port!.onmessage = (event: MessageEvent) => {
    const message = event.data as { type?: string } | null;
    if (message === null || typeof message !== "object") return;
    switch (message.type) {
      case "code": {
        const source = (message as { source?: string }).source ?? "";
        const streaming = (message as { streaming?: boolean }).streaming === true;
        if (!streaming) {
          buffer = source;
          void ensureRenderer().then((instance) => {
            instance.setImportMap({ imports });
            instance.render(source);
          });
        } else {
          const delta = source.startsWith(buffer) ? source.slice(buffer.length) : "";
          buffer = source;
          void ensureRenderer().then((instance) => {
            instance.setImportMap({ imports });
            if (delta === "" && source !== "") {
              instance.clear({ preserveVisualState: true });
              instance.render(source);
            } else if (delta !== "") {
              instance.pushCode(delta);
            }
          });
        }
        return;
      }
      case "css":
        appendCss((message as { css?: string }).css ?? "");
        return;
      case "result":
        succeed((message as { id: number }).id, (message as { value?: unknown }).value);
        return;
      case "error-response":
        fail((message as { id: number }).id, (message as { error?: { message?: string } }).error ?? {});
        return;
      case "detach":
        detach();
        return;
      default:
        return;
    }
  };
  // Handshake: the host may deliver code/CSS only after this arrives. An iframe
  // load event is not evidence that the runtime installed its import map/port.
  post({ type: "ready" });
  // The frame's opaque-origin facts, reported as evidence rather than as a permission.
  post({
    type: "isolation",
    origin: location.origin,
    cookie: (() => {
      try {
        document.cookie;
        return "readable";
      } catch {
        return "blocked";
      }
    })(),
    storage: (() => {
      try {
        localStorage;
        return "readable";
      } catch {
        return "blocked";
      }
    })(),
  });
}

/** Tear down this frame's runtime and every resource it minted. */
function detach(): void {
  if (detached) return;
  detached = true;
  generation += 1;
  ensurePromise = null;
  renderer?.detach();
  renderer = null;
  for (const pending of calls.values()) pending.reject(new Error("surface detached"));
  calls.clear();
  for (const url of blobs) URL.revokeObjectURL(url);
  blobs.length = 0;
  port?.close();
  port = null;
}

/** Append generated CSS to the frame's own sheet. */
function appendCss(css: string): void {
  if (detached || typeof css !== "string" || css === "") return;
  let sheet = document.querySelector<HTMLStyleElement>("style[data-ui4a-css]");
  if (sheet === null) {
    sheet = document.createElement("style");
    sheet.setAttribute("data-ui4a-css", "");
    document.head.appendChild(sheet);
  }
  sheet.textContent += css;
}

window.addEventListener("message", (event: MessageEvent) => {
  if (detached || port !== null || event.source !== window.parent) return;
  const data = event.data as { type?: string } | null;
  if (data === null || typeof data !== "object" || data.type !== "ui4a:init" || event.ports.length === 0) return;
  const nextPort = event.ports[0];
  if (nextPort === undefined) return;
  port = nextPort;
  port.start?.();
  try {
    start(data as InitMessage);
  } catch (error) {
    post({ type: "error", message: String((error as Error)?.message ?? error), phase: "compile" });
  }
});
