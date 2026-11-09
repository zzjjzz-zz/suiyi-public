import { expect, test } from "bun:test";
import { DEFAULT_CAPABILITIES, inlinePrompt, type Capabilities } from "../src/prompt.ts";

const ALL: Capabilities = { fs: true, ai: true, exec: true, web: true, chat: true };
const NO_EXEC: Capabilities = { ...ALL, exec: false };
import { skillBody } from "../src/skill.ts";
import { Config, serveExec } from "../src/index.ts";

// Two different defaults live here and conflating them hid a bug for weeks.
//
// The PRODUCT default is `Config`'s: what a host that configures nothing gets.
// This integration defaults OFF so generated cards cannot execute shell commands
// without an explicit setting change and its accompanying permission implications.
//
// The FUNCTION default is `inlinePrompt()` / `skillBody(a, b)`'s omitted argument, and it stays
// OFF on purpose, because the two directions are not equally bad: docs that under-describe a
// registered route cost the model a capability it could have used, while docs that describe an
// UNregistered one produce cards whose import fails — and a failed import takes the whole module
// down, so the reader gets a blank card naming nothing.
//
// Nothing used to pin the product default: these assertions all called the functions with no
// argument, so flipping `Config` changed nothing here. That is exactly how `skillBody` came to be
// called without its third argument at the one real call site — the prompt said six capabilities
// while the skill described five, and every test stayed green.

test("the product default — a host that configures nothing — is OFF on this branch", () => {
  const value: unknown = Config({}).allowExec;
  expect(typeof value === "boolean" ? value : (value as { get(): boolean }).get()).toBe(false);
});

test("the visual output preference is a Host volatile value, off by default", () => {
  const value = Config({}).visualOutput;
  expect(typeof value === "boolean" ? value : (value as { get(): boolean | undefined }).get()).toBe(false);
  expect(Config.dict!.visualOutput!.meta).toHaveProperty("volatile", true);
});

test("an explicit off is still honoured", () => {
  const value: unknown = Config({ allowExec: false }).allowExec;
  expect(typeof value === "boolean" ? value : (value as { get(): boolean }).get()).toBe(false);
});

test("an omitted argument documents the SMALLER set, which is the safe direction", () => {
  expect(inlinePrompt()).not.toContain("$dsh/exec");
  expect(skillBody(undefined, undefined)).not.toContain("$dsh/exec");
  // The safe direction generalises: an omitted argument describes NO host-backed capability, so
  // there is nothing for the model to reach for that a host may not have mounted.
  for (const backed of ["$dsh/fs", "$dsh/ai", "$dsh/exec", "$dsh/web", "$dsh/chat"]) {
    expect(inlinePrompt()).not.toContain(backed);
    expect(skillBody(undefined, undefined)).not.toContain(backed);
  }
  // The host bridge is denied by default; `$dsh/state` is local and stays.
  expect(inlinePrompt()).not.toContain("$dsh/chat");
  expect(inlinePrompt()).toContain("$dsh/state");
  expect(inlinePrompt(DEFAULT_CAPABILITIES)).toBe(inlinePrompt());
});

// The call site that reads the setting has to pass it on. Both halves, both directions.
test("with commands on, both halves document them", () => {
  expect(inlinePrompt(ALL)).toContain("$dsh/exec");
  expect(skillBody(undefined, undefined, ALL)).toContain("$dsh/exec");
});

// Not just the import line. A prompt that drops the bullet but keeps "run `git log` in a card"
// still teaches the model to reach for a capability whose import will fail — and a failed import
// takes the whole module down, so the reader gets a blank card naming nothing.
test("with commands off, nothing in either half suggests running one", () => {
  for (const text of [inlinePrompt(NO_EXEC), skillBody(undefined, undefined, NO_EXEC)]) {
    expect(text).not.toContain("$dsh/exec");
    expect(text).not.toContain("bash(");
    expect(text).not.toContain("## Running a command");
  }
});

// The closed-set sentence is what stops the model reasoning its way to a plausible sixth import,
// so it has to name the set that exists — claiming five while documenting four is worse than not
// claiming a number at all.
test("the closed-set sentence counts the capabilities that exist", () => {
  expect(inlinePrompt(NO_EXEC)).toContain("These five are the whole set");
  expect(inlinePrompt(ALL)).toContain("These six are the whole set");
  expect(inlinePrompt(NO_EXEC)).not.toContain("`exec`");
});

// The number and the list have to agree, and they did not: the list used to be built by
// SUBTRACTING from a string — `EVERY_CAPABILITY.replace(", \`exec\`", "")` — with a different
// escaping than the string it searched. It matched nothing, which `replace` reports by returning
// the input unchanged, so the sentence said "five" and then named six, `exec` among them, on a
// host where that import does not resolve. Count what the sentence actually lists rather than
// trusting either half, and the two cannot drift again.
test("the closed-set sentence lists exactly as many capabilities as it claims", () => {
  const WORDS: Record<string, number> = { four: 4, five: 5, six: 6, seven: 7 };
  for (const allowExec of [false, true]) {
    const sentence = /These (\w+) are the whole set — ([^—]+) —/.exec(inlinePrompt(allowExec ? ALL : NO_EXEC));
    expect(sentence).not.toBeNull();
    const claimed = WORDS[sentence![1]];
    const listed = [...sentence![2].matchAll(/`(\w+)`/g)].map((m) => m[1]);
    expect(listed.length).toBe(claimed);
    expect(listed.includes("exec")).toBe(allowExec);
  }
});

test("turning it on restores both halves", () => {
  expect(inlinePrompt(ALL)).toContain("$dsh/exec");
  expect(skillBody(undefined, undefined, ALL)).toContain("## Running a command");
});

// ─── Rejection tests: the OFF default must refuse, not merely omit ───
// A host that configures nothing gets the OFF default end to end: no prompt text, no skill
// reference, and — at the apply level — no exec route registered on the webServer. The third
// is the one that matters: documentation absence is persuasion, route absence is enforcement.
test("an unconfigured host teaches the model nothing about commands (the OFF default)", () => {
  // `Config({})` is exactly what `apply(ctx)` builds when the host passes no config at all.
  const defaultConfig = Config({});
  const allowExec = typeof defaultConfig.allowExec === "boolean" ? defaultConfig.allowExec : (defaultConfig.allowExec as { get(): boolean }).get();
  expect(allowExec).toBe(false);
  // What the model would be taught with the default config's capability set:
  expect(inlinePrompt({ fs: true, ai: true, exec: allowExec, web: true })).not.toContain("$dsh/exec");
});

// The route-level rejection: apply() with the default config must leave the exec path
// unregistered on the webServer. A bare 404 is what an unregistered path answers — the same
// answer a host with no shell service gives, so a card that reaches for `$dsh/exec` anyway
// gets the same failure a nonexistent capability always got.
test("an unconfigured host registers no exec route (the route is the switch)", () => {
  const registered: { kind: string; path: string }[] = [];
  const stopped: unknown[] = [];
  const stub = {
    // Only the services this test needs exist: no settings, so `installSection` never fires and
    // `rebuild`'s initial value — the Config({}) default — is what mounts the scoped fiber.
    inject: (names: string[], run: (c: unknown) => void) => {
      if (names.every((n) => n in stub)) run(stub);
    },
    effect: (run: () => unknown) => {
      const handle = run();
      stopped.push(handle);
      return handle;
    },
    plugin: (spec: { apply: (c: unknown) => void }) => {
      spec.apply(stub);
      return { dispose: async () => {} };
    },
    on: () => {},
    systemPrompt: { section: () => {}, context: () => {} },
    skills: { register: () => {} },
    webServer: { register: (route: { kind: string; path: string }) => void registered.push(route) },
    sessions: { list: () => [] },
    connection: { requestRejection: () => undefined },
    // `shell` is deliberately PRESENT: the service exists, so a default-on bug would register
    // the route. The OFF default must refuse to mount it even with the service available.
    shell: { resolve: () => ({}), run: async () => ({ exitCode: 0, stdout: { text: "", truncated: false }, stderr: { text: "", truncated: false } }) },
    sandboxPolicy: { resolve: () => undefined },
    llm: { stream: async function* () {} },
    agentDefaultModel: { currentSelection: () => ({ provider: "p", model: "m" }) },
    fs: {},
    web: { search: async () => ({ sources: [], truncated: false }) },
    agents: { get: () => undefined },
  };
  const { apply, EXEC_PATH } = require("../src/index.ts") as { apply: (c: unknown, config: unknown) => void; EXEC_PATH: string };
  apply(stub, Config({}));
  expect(registered.some((route) => route.path === EXEC_PATH)).toBe(false);
  // And the other routes still mounted — OFF is a refusal of ONE capability, not the plugin.
  expect(registered.length).toBeGreaterThan(0);
});

// The mirror: the same host with the setting ON registers the exec route. This pins that the
// OFF result above is the setting's doing, not a broken stub.
test("the same host with allowExec: true registers the exec route", () => {
  const registered: { kind: string; path: string }[] = [];
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
    webServer: { register: (route: { kind: string; path: string }) => void registered.push(route) },
    sessions: { list: () => [] },
    connection: { requestRejection: () => undefined },
    shell: { resolve: () => ({}), run: async () => ({ exitCode: 0, stdout: { text: "", truncated: false }, stderr: { text: "", truncated: false } }) },
    sandboxPolicy: { resolve: () => undefined },
    llm: { stream: async function* () {} },
    agentDefaultModel: { currentSelection: () => ({ provider: "p", model: "m" }) },
    fs: {},
    web: { search: async () => ({ sources: [], truncated: false }) },
    agents: { get: () => undefined },
  };
  const { apply, EXEC_PATH } = require("../src/index.ts") as { apply: (c: unknown, config: unknown) => void; EXEC_PATH: string };
  apply(stub, { allowExec: true, visualOutput: true });
  expect(registered.some((route) => route.path === EXEC_PATH)).toBe(true);
});

// The templating must not leak. A stray `__EXEC_BULLET__` in the prompt is text the model reads.
test("no placeholder survives into either build", () => {
  for (const on of [false, true]) {
    expect(inlinePrompt(on ? ALL : NO_EXEC)).not.toMatch(/__[A-Z_]+__/);
    expect(skillBody(undefined, undefined, on)).not.toMatch(/__[A-Z_]+__/);
  }
});

// The switch is enforced by NOT REGISTERING the route, so this is the one thing left to pin: the
// handler itself has no flag to check. That is deliberate — an unregistered path 404s exactly as
// it does on a host with no shell service, a path that already exists and is already handled, so
// a flag inside the handler would have invented a second way to fail.
test("the handler carries no switch of its own — the route is the switch", () => {
  expect(serveExec.toString()).not.toContain("allowExec");
  const source = require("node:fs").readFileSync("src/index.ts", "utf8") as string;
  // Whitespace-insensitive on purpose. This asserts a *shape*, and a formatter is entitled to
  // break `if (allowExec) scoped.inject(...)` across lines — which is exactly what a reflow did,
  // and the assertion then failed on a tree that had not changed behaviour at all. A source-text
  // check that depends on where a line ends is a check about the formatter (§6.4).
  expect(source.replace(/\s+/g, " ")).toContain('if (allowExec) scoped.inject(["shell", "sandboxPolicy"]');
});

// The switch must not become a way to lose the plugin. `installSettingsSection` lives entirely
// inside `ctx.inject(["settings"])`, so a host without that service never fires `onChange` — and
// `dsh --profile headless` is such a host. Everything is therefore mounted from an explicit call
// as well, guarded so a host that DOES have settings mounts once, not twice.
test("visual output off registers no generative prompt or skill", () => {
  const sections: unknown[] = [];
  const skills: unknown[] = [];
  const stub = {
    inject: (names: string[], run: (c: unknown) => void) => {
      if (names.every((name) => name in stub)) run(stub);
    },
    effect: (run: () => unknown) => void run(),
    plugin: (spec: { apply: (c: unknown) => void }) => {
      spec.apply(stub);
      return { dispose: async () => {} };
    },
    systemPrompt: { section: (s: unknown) => void sections.push(s), context: () => {} },
    skills: { register: (s: unknown) => void skills.push(s) },
  };
  const { apply } = require("../src/index.ts") as { apply: (c: unknown, config: unknown) => void };
  apply(stub, { allowExec: false, allowData: false, visualOutput: false });
  expect(sections).toHaveLength(0);
  expect(skills).toHaveLength(0);
});

test("a host with no settings service still mounts the prompt and the skill", () => {
  const sections: unknown[] = [];
  const contexts: unknown[] = [];
  const skills: unknown[] = [];
  const stub = {
    // A headless host: no settings service, no web server, no skills subsystem beyond the one
    // stubbed below. `inject` runs its callback only for services this table actually has, which
    // is what cordis does and what makes `inject(["settings"], …)` a dead branch here.
    inject: (names: string[], run: (c: unknown) => void) => {
      if (names.every((n) => n in stub)) run(stub);
    },
    effect: (run: () => unknown) => void run(),
    plugin: (spec: { apply: (c: unknown) => void }) => {
      spec.apply(stub);
      return { dispose: async () => {} };
    },
    systemPrompt: { section: (s: unknown) => void sections.push(s), context: (c: unknown) => void contexts.push(c) },
    skills: { register: (s: unknown) => void skills.push(s) },
  };
  const { apply } = require("../src/index.ts") as { apply: (c: unknown, config: unknown) => void };
  apply(stub, { allowExec: false, visualOutput: true });
  expect(sections.length).toBe(1);
  expect(skills.length).toBe(1);
});

/**
 * The same rule as `allowExec`, for every host-backed capability.
 *
 * Each one is only in the prompt, the closed-set sentence and the skill's references when its
 * route is registered. Documenting one that is not is the failure the `allowExec` comment spells
 * out: the model writes an import that fails and the whole module goes down.
 */
for (const [label, missing, bullet, reference] of [
  ["web", "web", "$dsh/web", "references/web.md"],
  ["fs", "fs", "$dsh/fs", "references/files.md"],
  ["ai", "ai", "$dsh/ai", "references/ai.md"],
] as const) {
  const absent: Capabilities = { ...ALL, [missing]: false };
  test(`a host with no ${label} documents neither the capability nor its reference`, () => {
    const prompt = inlinePrompt(absent);
    const skill = skillBody(undefined, undefined, absent);
    expect(prompt).not.toContain(bullet);
    expect(skill).not.toContain(reference);
    // The closed set must not name it either — that sentence is what stops the model reasoning
    // its way to an import we do not resolve.
    const sentence = /These \w+ are the whole set — ([^—]+) —/.exec(prompt)![1];
    expect(sentence).not.toContain(`\`${missing}\``);
  });

  test(`turning ${label} back on restores both halves`, () => {
    expect(inlinePrompt(ALL)).toContain(bullet);
    expect(skillBody(undefined, undefined, ALL)).toContain(reference);
  });
}

test("the capability count agrees with the list for every subset", () => {
  const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  for (const fs of [false, true])
    for (const ai of [false, true])
      for (const exec of [false, true])
        for (const web of [false, true]) {
          const sentence = /(?:These|This) (\w+) (?:are|is) the whole set — ([^—]+) —/.exec(inlinePrompt({ fs, ai, exec, web, chat: false }));
          expect(sentence).not.toBeNull();
          const listed = [...sentence![2].matchAll(/`(\w+)`/g)].map((m) => m[1]);
          expect(listed.length).toBe(WORDS[sentence![1]]);
          expect(new Set(listed)).toEqual(new Set(["fs", "ai", "exec", "web", "state"].filter((n) => n === "state" || { fs, ai, exec, web }[n as "fs"])));
        }
});
