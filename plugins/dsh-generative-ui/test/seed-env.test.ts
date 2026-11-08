import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const seedEnv = readFileSync(new URL("./seed/.env", import.meta.url), "utf8");
const apiKey = /^API_KEY=(.*)$/m.exec(seedEnv)?.[1];

test("the checked-in seed .env carries no live-looking API key", () => {
  expect(apiKey).toMatch(/^sk-test-invalid-[0-9]+$/);
  expect(seedEnv).not.toMatch(/sk-live-/);
});
