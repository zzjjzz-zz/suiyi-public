/**
 * Reads a canvas's current file contents through the plugin's own host route.
 *
 * Needed because `edit`-style tool calls carry a patch rather than the file: after one,
 * the tool-call stream no longer describes the canvas and only the file does.
 *
 * Every read carries the owning session's id. The route pairs `session` with `cwd` and
 * refuses a pair that names different sessions (§ "authorize session/cwd matching"): the
 * workspace is not identity, and a read must run under the access mode of the session
 * that owns it.
 */
import { CANVAS_READ_PATH } from "../../contract-assets.ts";

/** Monotonic per-read, so no two reads of one canvas can share a cache entry. */
let readSerial = 0;

/** The `session` + `cwd` pair the route authorizes, pre-encoded for the query string. */
const scope = (cwd: string, sessionId?: string) => `cwd=${encodeURIComponent(cwd)}${sessionId === undefined ? "" : `&session=${encodeURIComponent(sessionId)}`}`;

/** Every canvas in the workspace, including ones this session never wrote. */
export async function listCanvasIds(cwd: string, sessionId?: string): Promise<readonly string[]> {
  const response = await fetch(`${CANVAS_READ_PATH.slice(1)}?${scope(cwd, sessionId)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as string[];
}

export async function readCanvasFile(cwd: string, id: string, sessionId?: string): Promise<string | null> {
  // A distinct URL per read on top of `no-store`: the file is re-read precisely because it
  // changed, so any reuse of an earlier response is guaranteed to be the wrong answer.
  readSerial += 1;
  const url = `${CANVAS_READ_PATH.slice(1)}?${scope(cwd, sessionId)}&id=${encodeURIComponent(id)}&r=${readSerial}`;
  // `cache: "no-store"` on the request as well as the response: a canvas is re-read
  // precisely because it just changed, and a cached body is the one answer that is
  // guaranteed wrong.
  const response = await fetch(url, { cache: "no-store" });
  // 404 is ordinary: a canvas whose write is still streaming has no file yet.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

/**
 * Reads one of a canvas's sub-page files, named by the relative specifier as written in the
 * canvas source. The server resolves it through the contract; anything outside this canvas's
 * own child directory comes back 400 and reads here as null.
 */
export async function readCanvasChild(cwd: string, id: string, specifier: string, from: string, sessionId?: string): Promise<{ source: string; filename: string } | null> {
  readSerial += 1;
  const url = `${CANVAS_READ_PATH.slice(1)}?${scope(cwd, sessionId)}&id=${encodeURIComponent(id)}&child=${encodeURIComponent(specifier)}&from=${encodeURIComponent(from)}&r=${readSerial}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    // The server resolved the extension; the compiler needs it to pick a syntax.
    return { source: await response.text(), filename: response.headers.get("x-ui4a-filename") ?? `${specifier}.tsx` };
  } catch {
    return null;
  }
}
