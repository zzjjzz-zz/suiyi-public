/**
 * The model-visible capability surface for the isolated runtime.
 *
 * Recorded as a fixture rather than asserted phrase by phrase: this is the text a
 * model reads before writing a card, and a capability that appears here but is
 * denied at execution time is a blank card with no diagnosis. `$dsh/state` is the
 * only bridge left; filesystem, exec, search, chat and model calls are denied.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inlinePrompt } from "../src/prompt.ts";
import { skillBody } from "../src/skill.ts";
import { DEFAULT_CAPABILITIES } from "../src/capabilities.ts";

test("the complete model-visible prompt is recorded", () => {
  expect(inlinePrompt(DEFAULT_CAPABILITIES)).toMatchSnapshot();
});

test("the default isolated prompt names only the local state module", () => {
  const lines = inlinePrompt(DEFAULT_CAPABILITIES)
    .split("\n")
    .filter((line) => line.includes("$dsh/") || line.includes("whole set"))
    .join("\n");
  expect(lines + "\n").toBe(readFileSync(`${import.meta.dir}/fixtures/prompt-visual-output.txt`, "utf8"));
  expect(lines).toContain("$dsh/state");
  for (const denied of ["$dsh/chat", "$dsh/fs", "$dsh/exec", "$dsh/web", "$dsh/ai"]) expect(lines).not.toContain(denied);
});


test("recorded headless sessions prove the switch removes the hard protocol", () => {
  const snapshots = join(import.meta.dir, "../../../snapshots/session");
  const off = readFileSync(join(snapshots, "generative-ui-visual-output-off/system-prompt.expected.md"), "utf8");
  const on = readFileSync(join(snapshots, "generative-ui-visual-output-on/system-prompt.expected.md"), "utf8");
  // Off is an ordinary headless conversation: neither the section nor its skill leaks in.
  expect(off).not.toContain("# Generative UI");
  expect(off).not.toContain("ui4a/tsx");
  // On uses the real registered prompt and the state-only capability sentence.
  expect(on).toContain("# Generative UI");
  expect(on).toContain("This one is the whole set — `state`");
  for (const denied of ["$dsh/chat", "$dsh/fs", "$dsh/exec", "$dsh/web", "$dsh/ai"]) {
    expect(on).not.toContain(denied);
  }
});


test("the default skill body does not promise workspace I/O", () => {
  const body = skillBody(undefined, undefined, DEFAULT_CAPABILITIES);
  expect(body).not.toContain("readdir");
  expect(body).not.toContain("writeFile");
  expect(body).toContain("never claim the card can read the workspace");
});
