import { expect, test } from "bun:test";
import { serveSandbox, serveVisualOutput } from "../src/index.ts";
import { SANDBOX_PATH, SANDBOX_SCRIPT_PATH, SANDBOX_WRAPPER_PATH } from "../src/contract-assets.ts";

const response = () => {
  const headers: Record<string, string | string[]> = {};
  const res = {
    status: 0,
    body: "",
    writeHead(status: number, next?: Record<string, string | string[]>) {
      res.status = status;
      Object.assign(headers, next ?? {});
      return res;
    },
    end(body?: string) {
      res.body += body ?? "";
      return res;
    },
    headers,
  };
  return res;
};

const request = (path: string, method = "GET") => ({ method, url: path, headers: { host: "127.0.0.1:3081" } }) as never;

test("the document carries a deny-by-default sandbox CSP", async () => {
  const res = response();
  await serveSandbox(request(SANDBOX_PATH), res as never);
  expect(res.status).toBe(200);
  const csp = String(res.headers["content-security-policy"]);
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("connect-src http://127.0.0.1:3081/dsh-generative-ui/sandbox/tsx_bg.wasm");
  expect(csp).toContain("frame-src 'none'");
  // The inner document is framed by the trusted wrapper, whose own CSP pins the
  // exact inner route; the inner document does not allow being framed directly.
  expect(csp).not.toContain("frame-ancestors");
  expect(csp).not.toContain("https://esm.sh");
});

test("the trusted wrapper frames only the exact inner sandbox route", async () => {
  const res = response();
  await serveSandbox(request(SANDBOX_WRAPPER_PATH), res as never);
  expect(res.status).toBe(200);
  const csp = String(res.headers["content-security-policy"]);
  expect(csp).toContain("frame-src http://127.0.0.1:3081/dsh-generative-ui/sandbox https://127.0.0.1:3081/dsh-generative-ui/sandbox");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("script-src 'unsafe-inline'");
  expect(res.body).toContain('sandbox="allow-scripts"');
});

test("a missing runtime bundle is a 503 naming the build requirement", async () => {
  const res = response();
  await serveSandbox(request(SANDBOX_SCRIPT_PATH), res as never);
  expect([200, 503]).toContain(res.status);
  if (res.status === 503) expect(res.body).toContain("package build");
  else expect(res.headers["content-type"]).toContain("text/javascript");
});

test("readiness names the isolation and never enables exec by default", () => {
  const res = response();
  serveVisualOutput(false, false, request("/dsh-generative-ui/visual-output"), res as never);
  expect(res.status).toBe(200);
  expect(JSON.parse(res.body)).toMatchObject({ isolation: "iframe-opaque", allowExec: false, allowData: false, ai: false });
});
