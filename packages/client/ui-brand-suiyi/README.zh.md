---
description: "遂意侧栏品牌：飘带图形、双行中文字标，以及蓝青玻璃配色层。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-suiyi

[English](README.md) | 中文

## 概述

本包让以 `suiyi` profile 构建的客户端显示遂意侧栏身份：飘带图形、双行中文字标（汉字加拼音注记），以及叠在当前主题上的一层蓝青玻璃配色。随产品提供的 Web 与 Desktop 组合默认加载本包；互斥的构建 profile 保证侧栏品牌 slot 单一占用——本插件只在 `suiyi` 下注册，`ui-brand-official` 只在 `official` 下注册。这里的一切都是浏览器呈现，不涉及模型请求。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

随产品提供的 Web 与 Desktop 组合已挂载本插件。遂意桌面构建通过其构建 profile 激活本包；无需配置，本行也不接受配置。

### 选择 profile

`DSH_CLIENT_BUILD_PROFILE` 决定渲染哪个品牌。`suiyi` 构建显示遂意侧栏图形与字标，并叠加蓝青玻璃配色层；其他取值让本插件保持静默，外壳回退或官方品牌保持原样。profile 在构建时内联，因此任何产出 bundle 中恰好只有一个品牌插件占用单一占用的侧栏 slot。

### 图形

标志是遂意飘带：一束主体笔触与一束尾迹笔触交叉一条倾斜的轨道线，渐变引用主题 token，浅色与深色模式都保持清晰。名称是双行字标——汉字“遂意”在上，拼音注记 `S U I Y I` 在下。配色层把别名 token（品牌、背景、边框、文字、状态、侧栏填充）重新着色为蓝青玻璃色，同样携带浅色与深色两套值。悬停漂移是唯一的动效，减少动态效果偏好会关闭它。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

两个填充作为一组声明感知的注册安装：嵌套的 `ctx.slots.inject()` 调用等待侧栏声明，因此无论本行在声明者之前还是之后激活，这组注册都能工作；声明消失时两个填充一并撤回，HMR 期间也不会留下残缺的品牌混合。配色层通过 `ctx.effect()` 注册，插件卸载时随之移除。图形的渐变端点读取 `--dsw-alias-brand-primary` 与 `--dsw-alias-state-idle-primary`，不使用固定颜色，因此图形跟随当前激活的层叠。浏览器半部是 [`src/client/index.ts`](src/client/index.ts)；node 半部是空的 Loader 席位。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当品牌面不够用时阅读以下页面。它们从本包占据的 slot 进入渲染这些 slot 的外壳。

- [ui-sidebar](../ui-sidebar/README.zh.md)——声明 `sidebar.brand.mark` 与 `sidebar.brand.name` 并渲染其回退。
- [ui-theme](../ui-theme/README.zh.md)——持有 `overrideTokens` 与本包叠加的主题 token 层叠。
- [ui-brand-official](../ui-brand-official/README.zh.md)——通过 profile 分区共享这些 slot 的官方品牌填充。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了品牌呈现的供给方式。它们是当前包约束，不是品牌设计对比或任务积压。

- **只有一组填充**——替代呈现属于占据相同 slot 的另一个 Cordis 包。
- **profile 分区是构建期的**——构建 profile 内联进浏览器 bundle，一个 bundle 只携带一个品牌。
- **浏览器标题独立**——`DSH_CLIENT_TITLE` 在构建时选择标题文本，而非通过 UI slot。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
