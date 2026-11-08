import { expect, test } from "bun:test";
import { liveCanvasForSession, type ToolCallView } from "../src/client/canvas/collect.ts";

const write = (id: string, code: string, settled = false): ToolCallView => ({
  name: "write",
  argsRaw: JSON.stringify({ path: `/workspace/.dsh/ui4a/canvases/${id}.ui4a.tsx`, content: code }),
  settled,
});

test("growing tool arguments provide a live preview for the owning session", () => {
  const pending = [write("report", "export default () => <div>In progress</div>")];
  expect(liveCanvasForSession(pending, "s1", "s1", "report")).toEqual({
    id: "report",
    code: "export default () => <div>In progress</div>",
    streaming: true,
  });
  expect(liveCanvasForSession(pending, "s2", "s1", "report")).toBeUndefined();
  expect(liveCanvasForSession(pending, "s1", "s1", "other")).toBeUndefined();
});

test("only unsettled whole-file writes are previews; settled files defer to disk", () => {
  expect(liveCanvasForSession([write("report", "saved", true)], "s1", "s1", "report")).toBeUndefined();
  expect(liveCanvasForSession([write("report", "", false)], "s1", "s1", "report")).toBeUndefined();
  const patched: ToolCallView = {
    name: "str_replace_editor",
    argsRaw: JSON.stringify({
      path: "/workspace/.dsh/ui4a/canvases/report.ui4a.tsx",
      old_str: "first",
      new_str: "second",
    }),
    settled: true,
  };
  expect(liveCanvasForSession([patched], "s1", "s1", "report")).toBeUndefined();
});

test("latest in-progress write wins without mixing unrelated canvases", () => {
  const calls = [write("report", "older", true), write("another", "elsewhere"), write("report", "newest")];
  expect(liveCanvasForSession(calls, "s1", "s1", "report")?.code).toBe("newest");
});
