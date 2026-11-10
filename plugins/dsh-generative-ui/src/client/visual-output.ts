/**
 * The `visualOutput` provider this plugin supplies to the shared settings seam.
 *
 * Readiness and the accepted preference are observable sources. The preference is
 * the Host's volatile `dsh-generative-ui.visualOutput` config value, read and
 * written through `ctx.configForms`; there is no browser-local copy, so a desktop
 * port restart and a page reload see the same value. Readiness is two facts: the
 * runtime route reports `isolation: "iframe-opaque"`, and an injected connection
 * has a live authenticated generation. Either can arrive late or be removed; the
 * provider republishes in both directions.
 */
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {
  ConfigForm,
  VisualOutputCapability,
  VisualOutputReadiness,
} from "@deepseek-ai/dsh-client-ui-settings/client";
import { visualRuntimeConfig, resetVisualRuntimeConfig } from "./runtime/isolated-frame.ts";
import { disposeVisualInstances } from "./runtime/instances.ts";

/** Legacy namespace for runtimes predating entry-id discovery. */
export const VISUAL_OUTPUT_SETTINGS = "dsh-generative-ui";
const VISUAL_OUTPUT_FIELD = "visualOutput";

/** The provider is exactly the shared seam; no structural extras. */
export type VisualOutputProvider = VisualOutputCapability;

type Snapshot<T> = { getSnapshot: () => T; subscribe: (listener: () => void) => () => void };
type SettingsValue = { visualOutput?: boolean };

const snapshot = <T>(initial: T): { source: Snapshot<T>; set: (next: T) => void } => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    set(next) {
      if (Object.is(value, next)) return;
      value = next;
      // eslint-disable-next-line unicorn/no-useless-spread -- Subscribe and unsubscribe during publication apply to the next publication.
      for (const listener of [...listeners]) listener();
    },
    source: {
      getSnapshot: () => value,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
};

/**
 * Mount the provider for one client context.
 * @param ctx - client context; `connection` and `configForms` are injected so late arrival and removal are observable.
 * @param onChange - called when readiness or the accepted preference changes.
 * @returns the capability and an idempotent disposer.
 */
export function createVisualOutput(ctx: ClientContext, onChange: (enabled: boolean, ready: boolean) => void): { capability: VisualOutputProvider; dispose: () => void } {
  let connection: ConnectionHandle | undefined;
  let form: ConfigForm<SettingsValue> | undefined;
  let formRevision = 0;
  let formNamespace = VISUAL_OUTPUT_SETTINGS;
  let bindRuntimeForm: ((namespace: string) => void) | undefined;
  let configurationReady = false;
  let runtimeRevision = 0;
  let runtimePending: Promise<void> | undefined;
  let disposed = false;
  const readiness = snapshot<VisualOutputReadiness>({ ready: false, reason: "isolation" });
  // Readiness and the preference are separate sources; this listener set only
  // bridges the settings form's own observable to the seam's snapshot.
  const enabledListeners = new Set<() => void>();
  let stopForm: (() => void) | undefined;

  const formValue = (): SettingsValue | undefined => form?.getSnapshot().value;
  const enabledNow = (): boolean => formValue()?.visualOutput === true;
  const formReady = (): boolean => form !== undefined && form.getSnapshot().status === "ready";
  const permissionReady = (): boolean => connection !== undefined && connection.generation.getSnapshot() !== undefined && formReady();
  const readinessOf = (): VisualOutputReadiness => {
    if (!configurationReady) return { ready: false, reason: "isolation" };
    if (!permissionReady()) return { ready: false, reason: "permission" };
    return { ready: true };
  };
  const publish = (): void => {
    const next = readinessOf();
    readiness.set(next);
    onChange(enabledNow(), next.ready);
  };
  const notifyEnabled = (): void => {
    // eslint-disable-next-line unicorn/no-useless-spread -- Publish to the listeners present before callbacks can change the set.
    for (const listener of [...enabledListeners]) listener();
    publish();
    if (!configurationReady && runtimePending === undefined) readRuntime();
  };

  function readRuntime(): void {
    if (disposed || runtimePending !== undefined) return;
    const revision = runtimeRevision;
    runtimePending = visualRuntimeConfig().then(
      (runtime) => {
        if (disposed || revision !== runtimeRevision) return;
        configurationReady = true;
        const namespace = runtime.settingsNamespace ?? VISUAL_OUTPUT_SETTINGS;
        if (namespace !== formNamespace) {
          formNamespace = namespace;
          bindRuntimeForm?.(namespace);
        }
        publish();
      },
      () => {
        if (disposed || revision !== runtimeRevision) return;
        configurationReady = false;
        publish();
      },
    ).finally(() => { if (revision === runtimeRevision) runtimePending = undefined; });
  }

  const accountChanged = (): void => {
    // An account switch replaces the generation and a disconnect removes it.
    disposeVisualInstances();
    if (!configurationReady) {
      runtimeRevision += 1;
      runtimePending = undefined;
      resetVisualRuntimeConfig();
      if (connection?.generation.getSnapshot() !== undefined) readRuntime();
    }
    publish();
  };

  let stopGeneration: (() => void) | undefined;
  const stopInjects: (() => void)[] = [];
  const bindConnection = (next: ConnectionHandle | undefined): void => {
    if (next === connection) return;
    stopGeneration?.();
    stopGeneration = undefined;
    connection = next;
    stopGeneration = connection?.generation.subscribe(accountChanged);
    accountChanged();
  };
  const connectionHandle = ctx.inject(["connection"], (scoped) => {
    if (disposed) return;
    bindConnection(scoped.get("connection") as ConnectionHandle);
    return () => {
      bindConnection(undefined);
      disposeVisualInstances();
    };
  });
  if (typeof connectionHandle === "function") stopInjects.push(connectionHandle);
  // `inject` re-runs for late arrival; a replacement provider also emits this
  // framework event on the same context, which is the replacement path.
  const serviceHandle = ctx.on("internal/service", (name, value) => {
    if (disposed || name !== "connection") return;
    bindConnection(value as ConnectionHandle | undefined);
  });
  stopInjects.push(serviceHandle);
  const formHandle = ctx.inject(["configForms"], (scoped) => {
    if (disposed) return;
    const bind = (namespace: string): void => {
      stopForm?.();
      const revision = ++formRevision;
      form = scoped.configForms.get<SettingsValue>(namespace);
      stopForm = form.subscribe(() => {
        if (disposed || revision !== formRevision) return;
        notifyEnabled();
      });
      notifyEnabled();
    };
    bindRuntimeForm = bind;
    bind(formNamespace);
    return () => {
      if (bindRuntimeForm !== bind) return;
      bindRuntimeForm = undefined;
      formRevision += 1;
      stopForm?.();
      stopForm = undefined;
      form = undefined;
      notifyEnabled();
    };
  });
  if (typeof formHandle === "function") stopInjects.push(formHandle);


  const pagehide = (): void => {
    disposeVisualInstances();
  };
  globalThis.addEventListener?.("pagehide", pagehide);

  readRuntime();

  const enabledSource: Snapshot<boolean> = {
    getSnapshot: enabledNow,
    subscribe: (listener) => {
      enabledListeners.add(listener);
      return () => enabledListeners.delete(listener);
    },
  };

  const capability: VisualOutputProvider = {
    readiness: readiness.source,
    enabled: enabledSource,
    async setEnabled(next) {
      if (next && !readinessOf().ready) return false;
      if (form === undefined) return false;
      const accepted = await form.set(VISUAL_OUTPUT_FIELD, next);
      if (accepted) notifyEnabled();
      return accepted;
    },
  };

  publish();
  return {
    capability,
    dispose: () => {
      disposed = true;
      runtimeRevision += 1;
      formRevision += 1;
      stopGeneration?.();
      stopForm?.();
      for (const stop of stopInjects) stop();
      globalThis.removeEventListener?.("pagehide", pagehide);
      disposeVisualInstances();
      resetVisualRuntimeConfig();
    },
  };
}
