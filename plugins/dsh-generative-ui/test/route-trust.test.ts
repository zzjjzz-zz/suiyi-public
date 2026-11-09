/**
 * The trust fence in front of every plugin route.
 *
 * Three claims, each pinned by a negative test:
 *
 * 1. On a Suiyi host the composition's `connection` service owns the fence: every route
 *    fronts itself with `requestRejection` and answers its status code. Unauthenticated
 *    (no login credential) → 401; an untrusted Host or a cross-site marker → 403.
 * 2. A host lacking the authentication connection service has no authenticated
 *    routes; even a same-origin or headerless request is denied rather than silently admitted.
 * 3. `session` + `cwd` must name ONE live session: a request pairing someone else's workspace
 *    with another session's id — or no session at all — is refused before any read, listing,
 *    model call or command. `cwd` is not identity.
 */
import { describe, expect, test } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";

// The harness's request/response stand-ins, in the shape the routes read: `headers`,
// `method`, `url` on the request; `writeHead`/`end` on the response.
const request = (method: string, url: string, headers: Record<string, string> = {}, body = ""): IncomingMessage =>
  Object.assign(new EventEmitter(), {
    method,
    url,
    headers,
    destroyed: false,
    [Symbol.asyncIterator]() {
      return (async function* () {
        if (body !== "") yield Buffer.from(body);
      })();
    },
  }) as IncomingMessage;
const response = (): ServerResponse & { status?: number; ended?: boolean } => {
  const res = Object.assign(new EventEmitter(), {
    writableEnded: false,
    destroyed: false,
    writeHead(status: number) {
      (res as { status?: number }).status = status;
      return res;
    },
    end() {
      (res as { ended?: boolean }).ended = true;
      res.writableEnded = true;
      return res;
    },
    write() {
      return true;
    },
    setHeader() {
      return res;
    },
    statusCode: 0,
  }) as ServerResponse & { status?: number; ended?: boolean };
  return res;
};

describe("the Suiyi connection fence (registered in front of every route)", () => {
  // The fence is built at registration time inside `applyWith`, so this test drives `apply`
  // against a stub host carrying a `connection` service, and asserts the route never runs.
  const fencedHost = (verdict: 401 | 403) => {
    const called: { method: string; url: string; headers: Record<string, string> }[] = [];
    const registered: { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }[] = [];
    const stub = {
      inject: (names: string[], run: (c: unknown) => void) => {
        if (names.every((n) => n in stub)) run(stub);
      },
      effect: (run: () => unknown) => run(),
      plugin: (spec: { apply: (c: unknown) => void }) => {
        spec.apply(stub);
        return { dispose: async () => {} };
      },
      on: () => {},
      systemPrompt: { section: () => {}, context: () => {} },
      skills: { register: () => {} },
      webServer: { register: (route: { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }) => void registered.push(route) },
      sessions: { list: () => [] },
      // The Suiyi connection service: every request is refused with this verdict.
      connection: { requestRejection: () => verdict },
      fs: {},
      sandboxPolicy: { resolve: () => undefined },
      llm: { stream: async function* () {} },
      agentDefaultModel: { currentSelection: () => ({ provider: "p", model: "m" }) },
      web: { search: async () => ({ sources: [], truncated: false }) },
      __called: called,
    };
    return { stub, registered };
  };

  test("an unauthenticated request (401 verdict) is refused before the route body runs", async () => {
    const { apply, CANVAS_READ_PATH } = (await import("../src/index.ts")) as { apply: (c: unknown, config: unknown) => void; CANVAS_READ_PATH: string };
    const { stub, registered } = fencedHost(401);
    apply(stub, { allowExec: false, allowData: true });
    const canvasRoute = registered.find((route) => route.path === CANVAS_READ_PATH);
    expect(canvasRoute).toBeDefined();
    const res = response();
    canvasRoute!.handler(request("GET", `${CANVAS_READ_PATH}?cwd=/ws`), res as ServerResponse);
    expect(res.status).toBe(401);
    expect(res.ended).toBe(true);
  });

  test("every registered HTTP route rejects unauthenticated requests", async () => {
    const { apply } = await import("../src/index.ts");
    const { ASSET_PREFIX, CANVAS_READ_PATH, CARD_ERROR_PATH, FS_PATH, AI_STREAM_PATH, WEB_SEARCH_PATH, SANDBOX_PATH, VISUAL_OUTPUT_PATH } = await import("../src/contract-assets.ts");
    const { stub, registered } = fencedHost(401);
    apply(stub, { allowExec: false, allowData: true });
    for (const path of [ASSET_PREFIX, CANVAS_READ_PATH, CARD_ERROR_PATH, FS_PATH, AI_STREAM_PATH, WEB_SEARCH_PATH, SANDBOX_PATH, VISUAL_OUTPUT_PATH]) {
      const route = registered.find((entry) => entry.path === path);
      expect(route).toBeDefined();
      const res = response();
      await route!.handler(request("GET", path), res);
      expect(res.status).toBe(401);
      expect(res.ended).toBe(true);
    }
  });

  test("a malicious-Host request (403 verdict) is refused the same way", async () => {
    const { apply, CANVAS_READ_PATH } = (await import("../src/index.ts")) as { apply: (c: unknown, config: unknown) => void; CANVAS_READ_PATH: string };
    const { stub, registered } = fencedHost(403);
    apply(stub, { allowExec: false, allowData: true });
    const canvasRoute = registered.find((route) => route.path === CANVAS_READ_PATH);
    const res = response();
    canvasRoute!.handler(request("GET", `${CANVAS_READ_PATH}?cwd=/ws`, { host: "evil.example.com" }), res as ServerResponse);
    expect(res.status).toBe(403);
    expect(res.ended).toBe(true);
  });

  test("an admitted request (undefined verdict) reaches the route's own validation", async () => {
    const { apply, CANVAS_READ_PATH } = (await import("../src/index.ts")) as { apply: (c: unknown, config: unknown) => void; CANVAS_READ_PATH: string };
    const registered: { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }[] = [];
    const stub = {
      inject: (names: string[], run: (c: unknown) => void) => {
        if (names.every((n) => n in stub)) run(stub);
      },
      effect: (run: () => unknown) => run(),
      plugin: (spec: { apply: (c: unknown) => void }) => {
        spec.apply(stub);
        return { dispose: async () => {} };
      },
      on: () => {},
      systemPrompt: { section: () => {}, context: () => {} },
      skills: { register: () => {} },
      webServer: { register: (route: { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }) => void registered.push(route) },
      sessions: { list: () => [] },
      connection: { requestRejection: () => undefined },
      fs: {},
      sandboxPolicy: { resolve: () => undefined },
      llm: { stream: async function* () {} },
      agentDefaultModel: { currentSelection: () => ({ provider: "p", model: "m" }) },
      web: { search: async () => ({ sources: [], truncated: false }) },
    };
    apply(stub, { allowExec: false, allowData: true });
    const canvasRoute = registered.find((route) => route.path === CANVAS_READ_PATH);
    const res = response();
    canvasRoute!.handler(request("GET", `${CANVAS_READ_PATH}?cwd=/ws`), res as ServerResponse);
    // The fence passed; the route's session/cwd pairing refused the request — 400, not 401/403.
    expect(res.status).toBe(400);
  });
});

describe("session/cwd pairing (cross-session access is refused)", () => {
  const sessions = () => [
    { id: "alice-session", header: { cwd: "/ws/alice" } },
    { id: "bob-session", header: { cwd: "/ws/bob" } },
  ];

  test("canvas listing: a live session naming its OWN workspace is served", async () => {
    const { serveCanvas } = await import("../src/index.ts");
    const res = response();
    await serveCanvas(() => new Set(["/ws/alice", "/ws/bob"]), request("GET", "/dsh-generative-ui/canvas?cwd=/ws/alice&session=alice-session"), res, sessions);
    // 200 with an (empty) listing — the directory has no canvases.
    expect(res.status).toBe(200);
  });

  test("canvas listing: a session naming SOMEONE ELSE'S workspace is refused", async () => {
    const { serveCanvas } = await import("../src/index.ts");
    const res = response();
    // alice's session id paired with bob's cwd — the cross-session vector.
    await serveCanvas(() => new Set(["/ws/alice", "/ws/bob"]), request("GET", "/dsh-generative-ui/canvas?cwd=/ws/bob&session=alice-session"), res, sessions);
    expect(res.status).toBe(400);
    expect(res.ended).toBe(true);
  });

  test("canvas listing: no session at all is refused, even with a live cwd", async () => {
    const { serveCanvas } = await import("../src/index.ts");
    const res = response();
    await serveCanvas(() => new Set(["/ws/alice", "/ws/bob"]), request("GET", "/dsh-generative-ui/canvas?cwd=/ws/alice"), res, sessions);
    expect(res.status).toBe(400);
  });

  test("canvas read: a dead session id is refused", async () => {
    const { serveCanvas } = await import("../src/index.ts");
    const res = response();
    await serveCanvas(() => new Set(["/ws/alice", "/ws/bob"]), request("GET", "/dsh-generative-ui/canvas?cwd=/ws/alice&session=left-the-app&id=todo"), res, sessions);
    expect(res.status).toBe(400);
  });

  test("ai stream: the session must own the workspace before any model call", async () => {
    const { serveAi } = await import("../src/index.ts");
    const llm = {
      stream: async function* () {
        yield { type: "text-delta", text: "should never arrive" };
      },
    } as never;
    const agentDefaultModel = { currentSelection: () => ({ provider: "p", model: "m" }) } as never;
    const res = response();
    await serveAi({ llm, agentDefaultModel } as never, () => new Set(["/ws/alice", "/ws/bob"]), request("POST", "/dsh-generative-ui/ai?cwd=/ws/bob&session=alice-session", { "content-type": "application/json" }), res, sessions);
    expect(res.status).toBe(400);
    // And nothing was written: the refusal happened before the model was reached.
    expect((res as { ended?: boolean }).ended).toBe(true);
  });

  test("ai stream: the own pair reaches the model", async () => {
    const { serveAi } = await import("../src/index.ts");
    let streamed = false;
    const llm = {
      stream: async function* () {
        streamed = true;
        yield { type: "text-delta", text: "hi" };
      },
    } as never;
    const agentDefaultModel = { currentSelection: () => ({ provider: "p", model: "m" }) } as never;
    const res = response();
    await serveAi({ llm, agentDefaultModel } as never, () => new Set(["/ws/alice", "/ws/bob"]), request("POST", "/dsh-generative-ui/ai?cwd=/ws/alice&session=alice-session", { "content-type": "application/json" }, JSON.stringify({ prompt: "hi" })), res, sessions);
    expect(streamed).toBe(true);
  });
});

describe("fail-closed fence (hosts with no connection service)", () => {
  test("browser routes are not registered when Connection is unavailable", async () => {
    const { apply } = await import("../src/index.ts");
    const registered: string[] = [];
    const stub = {
      inject: (names: string[], callback: (ctx: unknown) => void) => {
        if (names.every((name) => name in stub)) callback(stub);
      },
      effect: (callback: () => unknown) => callback(),
      plugin: (spec: { apply: (ctx: unknown) => void }) => {
        spec.apply(stub);
        return { dispose: async () => {} };
      },
      on: () => {},
      systemPrompt: { section: () => {}, context: () => {} },
      skills: { register: () => {} },
      webServer: { register: (route: { path: string }) => registered.push(route.path) },
      sessions: { list: () => [] },
    };
    apply(stub as never, { allowExec: false });
    expect(registered).toEqual([]);
  });

  // `trustFenceOf` refuses every request without the authenticated connection service.
  test("a cross-site marker is refused", async () => {
    const { trustFenceOf } = await import("../src/index.ts");
    const ctx = {} as never;
    const rejected = trustFenceOf(ctx);
    const res = response();
    const refused = rejected(request("GET", "/x", { host: "localhost:3000", "sec-fetch-site": "cross-site" }) as IncomingMessage, res as ServerResponse);
    expect(refused).toBe(true);
    expect(res.status).toBe(403);
  });

  test("an Origin that is not the Host's own authority is refused", async () => {
    const { trustFenceOf } = await import("../src/index.ts");
    const rejected = trustFenceOf({} as never);
    const res = response();
    const refused = rejected(request("GET", "/x", { host: "localhost:3000", origin: "http://evil.example.com" }) as IncomingMessage, res as ServerResponse);
    expect(refused).toBe(true);
    expect(res.status).toBe(403);
  });

  test("even same-origin or bare requests are denied without authentication", async () => {
    const { trustFenceOf } = await import("../src/index.ts");
    const rejected = trustFenceOf({} as never);
    const sameOrigin = response();
    expect(rejected(request("GET", "/x", { host: "localhost:3000", origin: "http://localhost:3000" }) as IncomingMessage, sameOrigin as ServerResponse)).toBe(true);
    expect(sameOrigin.status).toBe(403);
    const bare = response();
    expect(rejected(request("GET", "/x", { host: "localhost:3000" }) as IncomingMessage, bare as ServerResponse)).toBe(true);
    expect(bare.status).toBe(403);
  });
});
