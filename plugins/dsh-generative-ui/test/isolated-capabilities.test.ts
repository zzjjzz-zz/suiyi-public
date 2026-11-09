/**
 * The execution-layer capability table, not the copy that describes it.
 *
 * A card that can render must not automatically reach the workspace, a shell, the
 * network, a search provider or a model. Each one is an explicit profile opt-in;
 * chat is granted by no config in this task.
 */
import { expect, test } from "bun:test";
import { capabilitiesFor } from "../src/client/runtime/isolated-frame.ts";

test("rendering alone grants no host bridge", () => {
  expect(capabilitiesFor({ allowExec: false, allowData: false })).toEqual({});
});

test("data access is one opt-in, exec is another, and neither grants chat", () => {
  const data = capabilitiesFor({ allowExec: false, allowData: true });
  expect(Object.keys(data).sort()).toEqual(["fs", "web"]);
  expect(data.fs).toContain("readFile");
  expect(data.fs).toContain("writeFile");
  expect(data.web).toEqual(["search"]);
  expect(data).not.toHaveProperty("chat");
  expect(data).not.toHaveProperty("exec");

  const exec = capabilitiesFor({ allowExec: true, allowData: false });
  expect(Object.keys(exec)).toEqual(["exec"]);
  expect(exec.exec).toEqual(["bash"]);
  expect(exec).not.toHaveProperty("chat");
});

test("no configuration exposes the chat or model bridge", () => {
  for (const allowExec of [false, true]) for (const allowData of [false, true]) {
    const groups = capabilitiesFor({ allowExec, allowData });
    expect(groups).not.toHaveProperty("chat");
    expect(groups).not.toHaveProperty("ai");
  }
});
