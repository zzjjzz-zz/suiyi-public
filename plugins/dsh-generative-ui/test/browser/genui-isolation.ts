/**
 * Real-browser probe driven by the real Host route handler.
 *
 * Run with Bun and Playwright available:
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs bun test/browser/genui-isolation.ts
 *
 * The server below does not invent a CSP: every sandbox document, wrapper,
 * runtime and wasm byte comes from `serveSandbox`. Playwright targets the frame
 * whose pathname is exactly `SANDBOX_PATH` (the inner opaque frame), never the
 * wrapper, and evaluates the attack attempts in that frame.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { SANDBOX_PATH, SANDBOX_SCRIPT_PATH, SANDBOX_WASM_PATH, SANDBOX_WRAPPER_PATH } from "../../src/contract-assets.ts";
import { serveSandbox } from "../../src/index.ts";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const port = Number(process.env.PORT ?? 39771);
const origin = `http://127.0.0.1:${port}`;
let canaries = 0;

const hostPage = `<!doctype html><meta charset="utf-8"><body><script>
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.style.width = "420px"; frame.style.height = "320px";
  document.body.append(frame);
  let started = false;
  const attempt = () => {
    if (started) return;
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === "isolation") {
        started = true;
        document.body.dataset.isolation = JSON.stringify(message);
        channel.port1.postMessage({ type: "code", source: 'export default function Card(){ return <div id="ok" style={{padding:12}}>hello sandbox</div>; }', streaming: false });
      }
      if (message.type === "rendered") document.body.dataset.rendered = String(message.source).slice(0, 200);
      if (message.type === "error") document.body.dataset.error = String(message.message);
    };
    frame.contentWindow.postMessage({ type: "ui4a:init", preserveState: true, capabilities: {}, imports: {}, state: {} }, "*", [channel.port2]);
    setTimeout(attempt, 800);
  };
  frame.addEventListener("load", attempt);
  frame.src = "${SANDBOX_WRAPPER_PATH}";
  setTimeout(attempt, 1000);
</script>`;const negativePage = `<!doctype html><meta charset="utf-8"><body><iframe sandbox="allow-scripts" referrerpolicy="no-referrer" src="${SANDBOX_WRAPPER_PATH}" style="width:420px;height:320px"></iframe>`;

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", origin).pathname;
  if (path === "/navigation-canary" || path === "/leak") { canaries += 1; res.writeHead(200); return res.end("canary"); }
  if (path === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(hostPage); }
  if (path === "/negative") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(negativePage); }
  if (path === SANDBOX_PATH || path === SANDBOX_WRAPPER_PATH || path === SANDBOX_SCRIPT_PATH || path === SANDBOX_WASM_PATH) {
    return serveSandbox(req, res);
  }
  res.writeHead(404); res.end();
});
await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const evidence: Record<string, unknown> = { canaries, negative: null, rendered: false, console: [], errors: [] };
try {
  const page = await browser.newPage();
  await page.goto(`${origin}/negative`);
  await page.waitForFunction(() => {
    return [...document.querySelectorAll("iframe")].some((frame) => frame.contentWindow !== null);
  });
  const inner = await waitForFrame(page, SANDBOX_PATH);
  evidence.negative = await inner.evaluate(async () => {
    const out: Record<string, string> = {};
    const attempt = (name: string, run: () => unknown) => {
      try { const value = run(); out[name] = value === undefined ? "no-throw" : String(value); }
      catch (error) { out[name] = `blocked:${(error as Error).name}`; }
    };
    attempt("cookie", () => document.cookie);
    attempt("localStorage", () => localStorage.length);
    attempt("parentDocument", () => parent.document.title);
    attempt("topDocument", () => top.document.title);
    attempt("childFrame", () => { const frame = document.createElement("iframe"); frame.src = "/navigation-canary"; document.body.append(frame); return "created"; });
    attempt("img", () => { const image = new Image(); image.src = "/leak"; document.body.append(image); return "created"; });
    try { await fetch("/navigation-canary"); out.fetch = "allowed"; } catch (error) { out.fetch = `blocked:${(error as Error).name}`; }
    attempt("selfNavigate", () => { location.href = "/navigation-canary"; return "set"; });
    return out;
  });
  await page.waitForTimeout(800);
  evidence.negativeCanaries = canaries;
  for (const key of ["cookie", "localStorage", "parentDocument", "topDocument"]) {
    if (!String((evidence.negative as Record<string, string>)[key]).startsWith("blocked:")) throw new Error(`${key} was not blocked`);
  }
  if (!String((evidence.negative as Record<string, string>).fetch).startsWith("blocked:")) throw new Error("network fetch was not blocked");
  if (canaries !== 0) throw new Error(`sandbox reached the network: ${canaries}`);

  const render = await browser.newPage();
  render.on("console", (message) => (evidence.console as string[]).push(`${message.type()}: ${message.text()}`));
  render.on("pageerror", (error) => (evidence.errors as string[]).push(error.message));
  await render.goto(`${origin}/`);
  await render.waitForFunction(() => document.body.dataset.rendered !== undefined, null, { timeout: 20_000 }).catch(() => undefined);
  const renderFrame = await waitForFrame(render, SANDBOX_PATH);
  evidence.rendered = (await renderFrame.evaluate(() => document.body.innerText).catch(() => "")).includes("hello sandbox");
  evidence.renderError = await render.evaluate(() => document.body.dataset.error ?? null);
  if (!evidence.rendered) throw new Error(`runtime did not render: ${JSON.stringify(evidence)}`);
} finally {
  console.log(JSON.stringify(evidence, null, 2));
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function waitForFrame(page: import("playwright").Page, pathname: string): Promise<import("playwright").Frame> {
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    const found = page.frames().find((frame) => {
      try {
        return new URL(frame.url()).pathname === pathname;
      } catch {
        return false;
      }
    });
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no frame with pathname ${pathname}; saw ${page.frames().map((frame) => frame.url()).join(", ")}`);
}
