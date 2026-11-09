# Optional standalone plugins

English | [中文](README.zh.md)

This directory contains source for optional standalone plugins that are **not enabled by default**. They are versioned with the main repository, but they do not join its pnpm workspace build, and they do not change the existing Web or desktop bundles, the agent loop, or the core packages.

## dsh-generative-ui

A generative UI plugin by MindLab (a standalone Cordis package with Node and browser halves): the model writes TSX in a `ui4a/tsx` fenced code block or a canvas file, and the dsh web client renders it live inside the conversation and the canvas panel.

- **Source**: the `main` branch of [zzjjzz-zz/dsh-generative-ui](https://github.com/zzjjzz-zz/dsh-generative-ui), brought in with `git subtree add --prefix=plugins/dsh-generative-ui <repo> main --squash`; the maintained upstream version follows that repository's [tags](https://github.com/zzjjzz-zz/dsh-generative-ui/tags).
- **License**: Apache-2.0; see `LICENSE` and `NOTICE` in the directory.
- **Sync**: later updates arrive with `git subtree pull --prefix=plugins/dsh-generative-ui https://github.com/zzjjzz-zz/dsh-generative-ui.git main --squash`; the standalone plugin repository remains.

### Disabled by default

Neither the main repository nor the default profile loads this plugin. To try it, build it from the plugin directory:

```sh
cd plugins/dsh-generative-ui
bun install --frozen-lockfile
bun run build
```

Its `prepare` script produces the build artifacts; install the result into a **test profile with an isolated DSH_HOME** (see `docs/user/develop/basic/publish.md` for `dsh plugin add link:...` and the rest of the CLI usage). Do not install it into the production `~/.dsh` configuration.

### Security blockers (production use forbidden)

- **Generated TSX runs on the host**: dynamic JS/TSX sandbox isolation is not complete; the runtime surface that generated code can reach is still the host environment.
- **Multi-user resource authorization is missing**: per-user resource authorization for multi-user scenarios (such as Keycloak user-level authorization) is not integrated, so nothing constrains different users' use of the same session resources.

Until both are addressed, **do not enable this plugin in production**; it is included only as optional source for isolated evaluation and further development.

### Known baseline test failures (3, all pre-existing upstream)

Of the 692 `bun test` cases, 688 pass, 1 is skipped, and the following 3 fail, matching the standalone repository's current state and not introduced here:

1. `ai: request completion keeps work alive; response disconnect=true`
2. `search: request completion keeps work alive; response disconnect=true`
3. `the resolved canvas renders`
