# 可选独立插件

本目录收纳**不默认启用**的可选独立插件源码，随主仓一起版本化，但不参与主仓的 pnpm workspace 构建，也不改变现有 Web / 桌面 bundle 与 agent-loop、核心包。

## dsh-generative-ui

MindLab 出品的生成式 UI 插件（独立 Cordis 双端包）：模型以 ```ui4a/tsx 围栏代码块或画布文件输出 TSX，由 dsh Web 端在对话内与画布面板中实时渲染。

- **来源**：[zzjjzz-zz/dsh-generative-ui](https://github.com/zzjjzz-zz/dsh-generative-ui) 的 main 分支，以 `git subtree add --prefix=plugins/dsh-generative-ui <repo> main --squash` 引入，对应源 commit `0eab211b0b75ebeb50e9b474080a92e0981ef79b`。
- **许可**：Apache-2.0，见目录内 `LICENSE` 与 `NOTICE`。
- **同步方式**：后续更新通过 `git subtree pull --prefix=plugins/dsh-generative-ui https://github.com/zzjjzz-zz/dsh-generative-ui.git main --squash` 合入，独立插件仓库保留。

### 当前默认不启用

主仓与默认 profile 均不加载此插件。试用时从插件目录独立构建：

```sh
cd plugins/dsh-generative-ui
bun install --frozen-lockfile
bun run build
```

构建产物随包内 `prepare` 生成，随后在**隔离 DSH_HOME 的测试 profile** 中安装试用（`dsh plugin add link:...` 等 CLI 用法参考 `docs/user/develop/basic/publish.zh.md`）。请勿安装进正式 `~/.dsh` 配置。

### 安全阻断（禁止生产启用）

- **生成的 TSX 在宿主执行**：动态 JS/TSX 沙箱隔离尚不完备，生成代码可触达的运行面仍以宿主环境为准。
- **多用户资源授权缺失**：多用户场景下的资源授权（如 Keycloak 用户级授权）尚未接入，无法约束不同用户对同一会话资源的使用。

在上述两项补齐前，**禁止在生产环境启用**；当前仅作为可选源码纳入，供隔离环境评估与后续开发。

### 已知基线测试失败（3 项，均为上游既有问题）

`bun test` 基线 692 项中 688 通过、1 跳过、以下 3 项失败，与独立仓库现状一致，非本仓引入：

1. `ai: request completion keeps work alive; response disconnect=true`
2. `search: request completion keeps work alive; response disconnect=true`
3. `the resolved canvas renders`
