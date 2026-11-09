# dsh-generative-ui

[English](README.md) | 中文

[![npm](https://img.shields.io/npm/v/dsh-generative-ui)](https://www.npmjs.com/package/dsh-generative-ui)
[![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供生成式 UI：agent 以实时 React 界面作答，而不是以文字作答。它是流式的——模型还在生成时，组件就已经渲染。

它出现在两个位置：

- **行内**——一个围栏 `ui4a/tsx` 代码块就地渲染在回复的段落之间。适合图表、表单、一组可点击的选项，以及读者想改数字重算的计算。
- **画布**——`ui4a/canvases/<id>.ui4a.tsx` 文件在对话旁的面板中打开，并跨轮次保留。适合用户会反复使用的工具。

生成的代码可以 import npm 上的任何包（渲染时从 esm.sh 解析），共享宿主唯一的 React 实例，并从应用自身的设计 token 取色，因此会跟随深浅主题。

那个围栏里的 `ui4a` 就是本插件实现的 harness——**UI for Agent**，出自 Mind Lab：与其把 agent 引导进固定的 UI schema，不如让它写普通前端代码，由运行时执行边界约束。背后的论证与基准见 [UI4A: A Component-Native Harness for Generative UI](https://www.mindlab.im/updates/ui4a-a-component-native-harness-for-generative-ui)。本包就是把该 harness 接入 dsh Web 客户端的实现。

## 安装

```sh
dsh plugin --profile web add dsh-generative-ui
```

已发布的 npm 版本附带构建源证明。在该仓库迁移后无法进行预览发布期间，若想试用未发布的 commit，可把 profile 指向本地检出——`lib/` 由 `prepare` 构建，因此 profile 并不关心这个包使用 bun 而 dsh 使用 pnpm：

```sh
dsh plugin --profile web add link:/path/to/dsh-generative-ui
```

`dsh plugin` 会把命令转发给 profile 的包管理器，因此下面任一方式都会安装该包，并把它加入 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles`——那才是 dsh 实际启动的列表。在干净机器上验证时，bundle 列表如下：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-generative-ui"
      ]
    }
  }
}
```

旁边的 `dependencies` 条目取决于你的安装形式——从 registry 安装时是一个 caret 范围，而 caret 对 `0.0.x` 版本会精确锁定：`^0.0.1` 只匹配 `0.0.1`，不匹配任何更晚版本。要允许补丁版本，请改成 `~0.0.1`。

启动 `dsh web`，它就在那里；如果它已经在运行，则需要重启——插件在启动时挂载，新增插件没有热重载。

**如果没有任何反应，先检查会话当前使用的 agent 预设。** 在 `minimal`（极简模式）下，persona 声明为 `complete: true`，因此任何内容都无法追加到系统提示词，`skill` 工具也不在该预设中——模型永远不会被告知这种格式存在。实测：系统提示词为 45 个字符，对照值为 27524，且完全未提及该围栏。渲染部分仍然可用，手动粘贴的卡片仍会渲染；只是模型不会主动写。请使用 `standard`，或复制该预设并加回 `tool-skill`。

## 工作原理

本包是一个插件，分两半，这正是 dsh 插件进入浏览器的方式：

| | |
| --- | --- |
| `lib/index.js`（node） | 注入系统提示词段落、注册 `generative-ui` skill、通过自己的 `webServer` 路由提供编译器 wasm 与画布文件读取 |
| `lib/client.js`（web） | 在转录中接管 `ui4a/tsx` 代码块、在浏览器内编译 TSX、挂载画布面板 |

模型通过两层获知，按各自成本拆分：

- **`src/prompt.ts`** 随每次请求发送，因此只携带触发条件、围栏语法、画布路径与颜色 token。
- **`skill/SKILL.md`** 通过 `ctx.skills.register()` 注册，只在模型主动取用时加载。它承载 UI 与行内／画布的选择，再指向 `skill/references/` 中按主题拆分的文件以给出编写细节。

这种拆分是实测出来的，不是假设——见 [CLAUDE.md](./CLAUDE.md) §4.5 中支撑它的 40 条提示词评测。

## 开发

```sh
bun install
bun run check     # lint + typecheck + build + smoke
```

`bun run build` 用 `Bun.build` 打包两半。[CLAUDE.md](./CLAUDE.md) 是设计文档——它记录本插件开发时所依据的宿主约束，每一条都是实际踩出来的。

## 许可

Apache-2.0
