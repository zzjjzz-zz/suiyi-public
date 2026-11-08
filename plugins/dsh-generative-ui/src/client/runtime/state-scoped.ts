/** Plugin-internal state identity. Keep the public $dsh/state module's exports unchanged. */
import type * as React from "react";
import { usePersistedState } from "./state.ts";

/** Stable per-session and per-surface keys, independent of the model-chosen name. */
export const scopedStateKey = (sessionId: string | undefined, surfaceId: string | undefined, key: string): string => `v2:${JSON.stringify([sessionId ?? null, surfaceId ?? null, key])}`;

/** Bind the public two-argument hook to a specific card or canvas. */
export function createScopedPersistedState(sessionId?: string, surfaceId?: string) {
  return function scopedPersistedState<T>(key: string, initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
    return usePersistedState(scopedStateKey(sessionId, surfaceId, key), initial);
  };
}
