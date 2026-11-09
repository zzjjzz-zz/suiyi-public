/**
 * The host-side half of the opaque-origin renderer.
 *
 * Generated code never touches this realm. This module owns the iframe, the
 * `MessageChannel` the frame uses for capabilities, and the translation between
 * the renderer calls `GenUISurface` already makes and the frame's source protocol.
 * Compilation happens in the frame (with the host-normalized source), so the
 * iframe needs no wasm route and no host credential.
 */
import { normalizeGeneratedTsxCompat } from "./normalize.ts";
import { bind } from "./bindings.ts";
import { createUnoCssDelta } from "./uno.ts";
import { SANDBOX_WRAPPER_PATH, VISUAL_OUTPUT_PATH } from "../../contract-assets.ts";
import { registerVisualInstance } from "./instances.ts";

/** What the provider advertises. `isolation` is deliberately not a boolean. */
export type VisualRuntimeConfig = { isolation: "iframe-opaque"; allowExec: boolean; allowData: boolean; ai: false };

let configPromise: Promise<VisualRuntimeConfig> | null = null;

/**
 * Read the runtime's readiness once. A failed request is a closed gate, never a
 * permissive fallback: without a verified isolation claim no generated code runs.
 */
export function visualRuntimeConfig(): Promise<VisualRuntimeConfig> {
  configPromise ??= (typeof document === "undefined"
    ? Promise.reject(new Error("visual output needs a browser document"))
    : fetch(VISUAL_OUTPUT_PATH.slice(1), { credentials: "same-origin" }))
    .then(async (response) => {
      if (!response.ok) throw new Error(`visual output runtime: ${response.status}`);
      const body = (await response.json()) as VisualRuntimeConfig;
      if (body?.isolation !== "iframe-opaque" || body.ai !== false || typeof body.allowData !== "boolean") throw new Error("visual output runtime is not isolated");
      return body;
    })
    .catch((error: unknown) => {
      configPromise = null;
      throw error;
    });
  return configPromise;
}

/** Test-only reset so a spec can exercise both a refused and an admitted runtime. */
export const resetVisualRuntimeConfig = (): void => {
  configPromise = null;
};

/** Callbacks the frame reports back to the surface. */
export type IsolatedCallbacks = {
  onError: (error: Error, phase: "transform" | "compile" | "render") => void;
  onRendered: (restored: boolean, source: string) => void;
};

export type IsolatedRenderer = {
  render: (code: string) => void;
  pushCode: (delta: string) => void;
  clear: (options: { preserveVisualState: boolean }) => void;
  setImportMap: (map: { imports?: Record<string, string> }) => void;
  detach: () => void;
};

const BASE_CAPABILITIES: Record<string, readonly string[]> = {};
// Workspace and network access are not part of rendering. They stay absent unless
// the profile opted in with `allowData`, which is a separate gate from the switch.
const DATA_CAPABILITIES: Record<string, readonly string[]> = {
  fs: ["readFile", "readdir", "readBytes", "writeFile"],
  web: ["search"],
};
const EXEC = { exec: ["bash"] } as const;

/**
 * The host-bridge groups a frame may call. Rendering alone grants none: filesystem,
 * search, exec and chat are separate opt-ins, and chat is not granted by any current
 * config. The parent rejects any group or member outside this table.
 * @param config - runtime readiness and the profile's opt-ins.
 * @returns group to allowed member names.
 */
export function capabilitiesFor(config: Pick<VisualRuntimeConfig, "allowExec" | "allowData">): Record<string, readonly string[]> {
  return { ...BASE_CAPABILITIES, ...(config.allowData ? DATA_CAPABILITIES : {}), ...(config.allowExec ? EXEC : {}) };
}

const stateKey = (sessionId: string | undefined, surfaceId: string | undefined): string =>
  `dsh-generative-ui:state:${sessionId ?? "session"}:${surfaceId ?? "surface"}`;

function readState(key: string): Record<string, unknown> {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const parsed: unknown = raw === null || raw === undefined ? {} : JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function writeState(key: string, patch: { key: string; value: unknown }): void {
  try {
    const next = readState(key);
    next[patch.key] = patch.value;
    globalThis.localStorage?.setItem(key, JSON.stringify(next));
  } catch {
    // Opaque-origin generated code cannot reach this; a host with storage disabled
    // still renders, it just forgets private card state across reloads.
  }
}

const normalize = (code: string, streaming: boolean): string => {
  try {
    return normalizeGeneratedTsxCompat(code, { mode: streaming ? "streaming" : "final" });
  } catch {
    return code;
  }
};

/**
 * Create one framed renderer.
 *
 * The returned object mirrors the part of `GenUIRenderer` `GenUISurface` uses, so
 * the surface's streaming, retry and failure policy stays unchanged. Every call
 * after `detach` is a no-op; the frame is removed and its port closed.
 */
export function createIsolatedRenderer(
  host: HTMLElement,
  options: {
    sessionId?: string;
    surfaceId?: string;
    preserveState: boolean;
    callbacks: IsolatedCallbacks;
    config: VisualRuntimeConfig;
  },
): IsolatedRenderer {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("title", "Generated UI");
  frame.style.width = "100%";
  frame.style.border = "0";
  frame.style.display = "block";
  frame.style.background = "transparent";
  frame.style.colorScheme = "normal";
  frame.src = SANDBOX_WRAPPER_PATH.slice(1);

  let port: MessagePort | null = null;
  let generation = 0;
  let alive = true;
  let ready = false;
  let raw = "";
  let lastImports: Record<string, string> = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const inflight = new Map<number, AbortController>();
  let css = createUnoCssDelta();
  let cssQueue: Promise<void> = Promise.resolve();
  const key = stateKey(options.sessionId, options.surfaceId);
  const capabilities = capabilitiesFor(options.config);
  const allowed = (group: string, member: string): boolean => (capabilities as Record<string, readonly string[]>)[group]?.includes(member) === true;

  const send = (message: Record<string, unknown>): void => {
    if (!alive || port === null) return;
    port.postMessage(message);
  };
  const sendSource = (streaming: boolean): void => {
    if (!ready) return;
    const source = normalize(raw, streaming);
    const forGeneration = generation;
    const stream = css;
    send({ type: "code", source, streaming });
    // Serialize generation and delivery. Dropping an older delta because a newer
    // frame arrived loses its rule forever: `next` has already marked its tokens
    // seen, and the next delta carries only fresh tokens. The generation guard
    // still prevents a reloaded frame from receiving any old CSS.
    cssQueue = cssQueue
      .then(async () => {
        if (!alive || forGeneration !== generation) return;
        const delta = await stream.next(source, streaming);
        if (!alive || forGeneration !== generation || delta === "") return;
        send({ type: "css", css: delta });
      })
      .catch(() => undefined);
  };
  const armTimeout = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      if (ready) return;
      options.callbacks.onError(new Error("visual output sandbox did not start"), "compile");
      destroy();
    }, 10_000);
  };

  const listen = (next: MessagePort, forGeneration: number): void => {
    next.onmessage = (event: MessageEvent) => {
      const message = event.data as { type?: string } | null;
      if (!alive || forGeneration !== generation || message === null || typeof message !== "object") return;
      switch (message.type) {
        case "ready": {
          // The child runtime says its import map and port are live. Only now may
          // the host claim readiness; the iframe load event is not a renderer.
          ready = true;
          if (timer !== null) clearTimeout(timer);
          timer = null;
          send({ type: "imports", imports: lastImports, capabilities });
          if (raw !== "") sendSource(false);
          return;
        }
        case "rendered": {
          const painted = (message as { source?: string }).source ?? "";
          options.callbacks.onRendered(normalize(raw, false).trimEnd() !== painted.trimEnd(), painted);
          return;
        }
        case "error": {
          const failure = message as { message?: string; phase?: "transform" | "compile" | "render" };
          options.callbacks.onError(new Error(failure.message ?? "generated code failed"), failure.phase ?? "compile");
          return;
        }
        case "state": {
          const patch = message as { key?: string; value?: unknown };
          if (typeof patch.key === "string") writeState(key, { key: patch.key, value: patch.value });
          return;
        }
        case "call": {
          const call = message as { id?: number; group?: string; member?: string; args?: unknown[] };
          if (typeof call.id !== "number" || typeof call.group !== "string" || typeof call.member !== "string") return;
          if (!allowed(call.group, call.member)) {
            send({ type: "error-response", id: call.id, error: { message: `[dsh-generative-ui] capability ${call.group}.${call.member} is not enabled` } });
            return;
          }
          const id = call.id;
          const controller = new AbortController();
          inflight.set(id, controller);
          const args = [...(call.args ?? [])];
          if (call.group === "exec" || call.group === "web") {
            const opts = args[1] !== null && typeof args[1] === "object" ? (args[1] as Record<string, unknown>) : {};
            args[1] = { ...opts, signal: controller.signal };
          }
          void (async () => {
            try {
              const bound = bind(options.sessionId, options.surfaceId);
              const group = Reflect.get(bound, call.group!) as Record<string, (...values: unknown[]) => unknown> | undefined;
              const member = group?.[call.member!];
              if (typeof member !== "function") throw new Error(`[dsh-generative-ui] capability ${call.group}.${call.member} is not bound`);
              const value = await member(...args);
              if (forGeneration === generation) send({ type: "result", id, value });
            } catch (error) {
              const failure = error as { message?: string; code?: string; denied?: boolean };
              if (forGeneration === generation) send({ type: "error-response", id, error: { message: failure?.message ?? String(error), code: failure?.code, denied: failure?.denied } });
            } finally {
              // A reload can reuse ids; only this controller may remove its entry.
              if (inflight.get(id) === controller) inflight.delete(id);
            }
          })();
          return;
        }
        case "abort": {
          const id = (message as { id?: number }).id;
          if (typeof id === "number") inflight.get(id)?.abort();
          return;
        }
        default:
          return;
      }
    };
    next.start?.();
  };

  const unregister = registerVisualInstance(() => destroy());
  armTimeout();
  const onLoad = (): void => {
    if (!alive) return;
    const target = frame.contentWindow;
    if (target === null) return;
    // A second load is a document reload. Retire the old generation's port and
    // in-flight calls before transferring a fresh port; never transfer the same
    // `port2` twice.
    generation += 1;
    port?.close();
    for (const controller of inflight.values()) controller.abort();
    inflight.clear();
    ready = false;
    css.dispose();
    css = createUnoCssDelta();
    cssQueue = Promise.resolve();
    const channel = new MessageChannel();
    port = channel.port1;
    listen(port, generation);
    target.postMessage(
      {
        type: "ui4a:init",
        preserveState: options.preserveState,
        capabilities,
        imports: lastImports,
        state: readState(key),
      },
      "*",
      [channel.port2],
    );
    armTimeout();
  };
  frame.addEventListener("load", onLoad);
  host.appendChild(frame);

  function destroy(): void {
    if (!alive) return;
    alive = false;
    generation += 1;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    for (const controller of inflight.values()) controller.abort();
    inflight.clear();
    port?.close();
    port = null;
    css.dispose();
    frame.removeEventListener("load", onLoad);
    frame.remove();
    unregister();
  }

  return {
    render(code) {
      raw = code;
      sendSource(false);
    },
    pushCode(delta) {
      raw += delta;
      sendSource(true);
    },
    clear() {
      raw = "";
      if (ready) send({ type: "clear" });
    },
    setImportMap(map) {
      lastImports = { ...lastImports, ...(map.imports ?? {}) };
      // Import maps are delivered on the ready handshake; sending before the
      // child has the port would race the init transfer.
      if (ready) send({ type: "imports", imports: lastImports, capabilities });
    },
    detach: destroy,
  };
}
