/**
 * Three artifacts, two build faces.
 *
 * Host: `lib/index.js` (ESM) from `lib/types/index.js`, built before the Client compile.
 * Client: `lib/client.js` (CJS loader factory) from `lib/types/client/index.js`, built by the
 * shared preset with the shell's module table external.
 * Sandbox: `lib/sandbox/runtime.js`, one self-contained browser ESM runtime for the opaque-origin frame.
 * It bundles React, React DOM and partial-react so the frame makes no CDN request; `tsx_bg.wasm`
 * is copied beside it for `new URL("tsx_bg.wasm", import.meta.url)`.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { UserConfig } from "tsdown";
import { clientBundle } from "../../packages/client/tsdown.client.ts";
import { collectSandboxLicenses } from "./scripts/collect-sandbox-licenses.mjs";

const packageDir = import.meta.dirname;
const wasm = createRequire(import.meta.url).resolve("@esm.sh/tsx/pkg/tsx_bg.wasm");

/** The Host serves this file from `lib/`; the sandbox bundle resolves it relative to itself. */
const copyTsxWasm = {
  name: "dsh-generative-ui-tsx-wasm",
  writeBundle() {
    mkdirSync(join(packageDir, "lib", "sandbox"), { recursive: true });
    copyFileSync(wasm, join(packageDir, "lib", "sandbox", "tsx_bg.wasm"));
  },
};

/** The offline bundle embeds its dependencies; their texts ship beside it. */
const collectLicenses = {
  name: "dsh-generative-ui-sandbox-licenses",
  writeBundle() {
    collectSandboxLicenses(packageDir);
  },
};

const sandbox: UserConfig = {
  name: "@deepseek-ai/dsh-generative-ui/sandbox",
  // Runtime resolution is the real package, never the type-check declaration adapter.
  tsconfig: "tsconfig.bundle.json",
  entry: { sandbox: "src/sandbox/index.ts" },
  outDir: "lib/sandbox",
  format: ["esm"],
  platform: "browser",
  target: "es2022",
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: false,
  // One script served by the Host; a sibling chunk would be a second route and a second fetch.
  noExternal: [/.*/],
  inputOptions: {
    resolve: {
      mainFields: ["browser", "module", "main"],
      aliasFields: [["browser"]],
      conditionNames: ["browser", "import", "module", "default"],
    },
  },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  outputOptions: { entryFileNames: "runtime.js", inlineDynamicImports: true },
  plugins: [copyTsxWasm, collectLicenses],
};

const bundle = clientBundle(packageDir, ["lib/types/index.js"], { hostPhase: true });

const bundled = (inline: Parameters<typeof bundle>[0]): UserConfig[] =>
  bundle(inline).map(config => ({ ...config, tsconfig: "tsconfig.bundle.json" }));

export default (inline: Parameters<typeof bundle>[0]): UserConfig[] =>
  inline.env?.DSH_BUILD_FACE === "client" ? bundled(inline) : [...bundled(inline), sandbox];
