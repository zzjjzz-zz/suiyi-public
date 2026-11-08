/**
 * One canvas tab's body: the file behind the address, rendered.
 *
 * A seat body, not a chrome host. The tab strip, header, close control and width drag are the
 * host's; this is the `GenUISurface` layer and the sub-page resolve that feeds it.
 */
import { useEffect, useState } from "react";
import { observeTranscript } from "../runtime/observe.ts";
import type { Canvas } from "./collect.ts";
import { parseFileAddress } from "@deepseek-ai/dsh-util-workspace-path";
import type { PropsRuntime, TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import { GenUISurface } from "../runtime/GenUISurface.tsx";
import { canvasIdOfAddress } from "./definition.ts";
import { readCanvasFile } from "./read.ts";
import { useSubPages } from "./subpages.ts";
import { CanvasReadStatus } from "./read-status.tsx";

/**
 * The registrant's business face, bound per tab occurrence.
 *
 * `inject` is a factory: the framework resolves the session and hands it over, so `cwdOf` is
 * asked for a specific session rather than reaching for "whichever one is on screen". Several
 * sessions share a workspace and a tab may belong to one the reader is not looking at — the
 * read route allowlists `cwd` against each session's `header.cwd`, so getting this wrong runs
 * the read under a stranger's allowlist (§3.65 hit the same shape on `$dsh/fs`).
 */
export type CanvasInjected = {
  /** The workspace root a given session reads under. */
  readonly cwdOf: (sessionId: string) => string | undefined;
  /** The actively streamed body of this canvas, only if it belongs to the named session. */
  readonly previewOf?: (sessionId: string, id: string) => Canvas | undefined;
  /** A canvas that failed to compile; see `runtime/report-error.ts`. */
  readonly onCardError: (message: string, phase: string) => void;
  /** A canvas that painted; see `runtime/report-error.ts`. */
  readonly onCardRendered: (restored: boolean) => void;
};

export type CanvasBodyProps = PropsRuntime<"sidebar.right.pane.tab"> & CanvasInjected & { t: TranslateNS<"ui4aCanvas"> };

export function CanvasBody({ useTabInfo, cwdOf, previewOf, onCardError, onCardRendered, t }: CanvasBodyProps) {
  const { tab } = useTabInfo();
  const address = tab.contentId;
  const id = canvasIdOfAddress(address);
  const parsed = parseFileAddress(address);
  // The address's own session, not the tab's standard-prop one and never "current": the two
  // only agree when the reader happens to be looking at the session that wrote the canvas.
  const sessionId = parsed?.scope === "session" ? parsed.sessionId : undefined;
  const cwd = sessionId === undefined ? undefined : cwdOf(sessionId);
  const ownerKey = `${sessionId ?? ""}:${id ?? ""}`;
  const [saved, setSaved] = useState<{ ownerKey: string; code: string } | null>(null);
  const [preview, setPreview] = useState<{ ownerKey: string; canvas: Canvas } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const diskCode = saved?.ownerKey === ownerKey ? saved.code : null;
  const live = preview?.ownerKey === ownerKey ? preview.canvas : undefined;

  // Shares the existing frame-coalesced transcript observer; an unchanged frame is a no-op.
  useEffect(() => {
    if (sessionId === undefined || id === null || previewOf === undefined) return;
    return observeTranscript(() => {
      const next = previewOf(sessionId, id);
      setPreview((old) => (old?.ownerKey === ownerKey && old.canvas.code === next?.code && old.canvas.streaming === next?.streaming ? old : next === undefined ? null : { ownerKey, canvas: next }));
    });
  }, [id, sessionId, ownerKey, previewOf]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (cwd === undefined || id === null) return;
    let live = true;
    setError(null);
    setLoading(true);
    // Preserve the last successful frame while a new revision is being read.
    // Ownership is checked by diskCode so another session's canvas is never displayed.
    void readCanvasFile(cwd, id, sessionId)
      .then((code) => {
        if (live) {
          // A streamed write may not have reached disk yet (404). Keep the last
          // good file while a write is active; otherwise a removed file stays removed.
          if (code !== null) setSaved({ ownerKey, code });
          else if (sessionId === undefined || id === null || previewOf?.(sessionId, id) === undefined) setSaved(null);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (live) {
          setError(reason);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
    // `revision` increments on every navigation to this tab, and auto-open re-navigates when an
    // `edit` marks the canvas stale — so a patch is re-read here without the transcript having
    // to carry the new body. `visible` deliberately does not appear: with `keepMounted` the body
    // survives a hide, and re-reading on every return would drop state for nothing.
  }, [cwd, id, ownerKey, sessionId, tab.navigation.revision, retry]);

  // A growing tool-call body is a preview; a completed write is read from disk.
  // Never call a preview saved, and never treat a preview's source as authoritative.
  const code = live?.code ?? diskCode;
  const resolved = useSubPages(cwd, code === null || id === null ? undefined : { id, code, streaming: live !== undefined }, sessionId);

  // Explicit retries preserve the last successfully rendered file. An error stays
  // visible through the retry affordance without destroying interactive state.
  const retryRead = () => {
    setError(null);
    setLoading(true);
    setRetry((n) => n + 1);
  };

  if (id === null) return null;
  if (error !== null && code === null) return <CanvasReadStatus t={t} error={error} retry={retryRead} />;
  if (code === null) return <CanvasReadStatus t={t} retry={loading ? undefined : retryRead} />;
  // A canvas is inset; an inline card is not. The card is told to fill whatever holds it, so
  // the two surfaces have to differ HERE rather than in every generated component — inline sits
  // in the transcript and must share the prose's left edge, while a canvas in a panel with its
  // own chrome wants breathing room or the title sits on the frame. `24px` is the host's own
  // number: the Sidebar's guide tab body (`sidebar.right.tab.guide`, the same seat family as
  // this one) is `padding: 0 24px`.
  //
  // The grid row is the old panel's `.dgu-body > * { min-height: 100% }` without a stylesheet:
  // one row at least as tall as the box and free to grow, so a short card still fills the panel
  // and a card that asks for `height: 100%` has something to resolve against. `box-sizing:
  // border-box` keeps that 100% inside the padding rather than overflowing it.
  return (
    <div style={{ boxSizing: "border-box", height: "100%", minHeight: 0, overflow: "auto", padding: "24px", display: "grid", gridTemplateRows: "minmax(100%, auto)" }}>
      {live !== undefined && (
        <div role="status" style={{ fontSize: 12, opacity: 0.7, paddingBottom: 8 }}>
          {t("preview.streaming")}
        </div>
      )}
      {error !== null && (
        <div role="alert" style={{ fontSize: 12, paddingBottom: 8 }}>
          {t("read.error")}{" "}
          <button type="button" onClick={retryRead}>
            {t("read.retry")}
          </button>
        </div>
      )}
      <GenUISurface key={ownerKey} sessionId={sessionId} surfaceId={`canvas:${id}`} code={resolved} streaming={live !== undefined} onError={(error, phase) => onCardError(error.message, phase)} onRendered={onCardRendered} />
    </div>
  );
}
