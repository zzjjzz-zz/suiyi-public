---
description: "遂意侧栏品牌：流体飘带图形、单行中文字标、Noto Sans SC 字体，以及蓝青玻璃 token 层与背景光晕。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-suiyi

[English](README.md) | 中文

遂意控件在深浅主题中使用原型的表面与分隔线颜色。开关采用 34 px 轨道与白色 14 px 滑块，两种主题的启用态都使用相同蓝色。

## 概述

本包让以 `suiyi` profile 构建的客户端显示遂意身份：原型中的流体飘带图形出现在侧栏、空白首页、等待模型输出期间与每条回答之前；单行中文字标；标题字重 300、字标字重 500 的 Noto Sans SC 字体栈；以及一层蓝青玻璃 token 与背景光晕。随产品提供的 Web 与 Desktop 组合默认加载本包；互斥的构建 profile 保证侧栏品牌 slot 单一占用——本插件只在 `suiyi` 下注册，`ui-brand-official` 只在 `official` 下注册。这里的一切都是浏览器呈现，不涉及模型请求。

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

`DSH_CLIENT_BUILD_PROFILE` 决定渲染哪个品牌。`suiyi` 构建显示遂意侧栏图形与字标，给文档 body 打上 `suiyi` 品牌作用域，并叠加蓝青玻璃 token 层；其他取值让本插件保持静默，外壳回退或官方品牌保持原样。profile 在构建时内联，因此任何产出 bundle 中恰好只有一个品牌插件占用单一占用的侧栏 slot。

### 图形

全部功能弹窗与工作区切换器通过 `--dsw-brand-dialog-shadow`、`--dsw-brand-dialog-mask` 和 `--dsw-brand-workspace-border` 共用原型玻璃配色。

Web 构建同时选择深浅配色的 Suiyi 页签图标、Apple 主屏幕图标和 Suiyi 安装清单。PNG 图标由现有桌面图标缩放生成；official profile 保留自身的浏览器资源。

标志是原型飘带：一束主体笔触与一束尾迹笔触交叠出同一轮廓，另有两处白色玻璃高光与一束尾迹描边。四处着色渐变读取 `--dsw-brand-mark-wing-*` 与 `--dsw-brand-mark-wake-*` 主题 token，浅色与深色图形各自保留原型端点；玻璃高光属于图形本身，不随主题变化。侧栏与首页图形以 7.8 秒的单次循环漂移，并带玻璃微光。回答前图形在步骤流式输出时使用更快的思考漂移，步骤结束后保持静止。

字标只有一行——中文为汉字“遂意”，其他语言为产品名——字号 22 px、字重 500、字距 0.04 em。原型已移除拼音副标，因此不存在第二行。

三处位置共用同一图形：侧栏 slot 请求 24 px，空白首页请求 96 px 并传入首页几何类，回答前 slot 请求 32 px 并传入 `running`；每个填充都保留宿主类，因此周围的悬停目标、回答列与响应式尺寸照常生效。slot 未被占用时保留声明方自己的回退：其他 profile 继续显示侧栏标志、首页鲸鱼与回答列图形。

文本字体栈以 Noto Sans SC 开头，随后是 Source Han Sans SC、Noto Sans CJK SC、PingFang SC 与 Microsoft YaHei。Noto 子集随 `ui-theme` 一同发布，因此该字体无需联网；用户自定义字体仍排在它前面。页面标题通过下面的 token 采用 300 字重。

会话输入框与首页快捷药丸消费 `--dsw-brand-composer-*` 与 `--dsw-brand-shortcut-*` 材质 token：中性默认值复现当前会话表面，本 profile 用原型的渐变、描边、投影与圆角替换，官方 profile 不受影响。

token 层把别名 token（品牌、背景、边框、文字、状态、侧栏填充）重新着色为原型的蓝青玻璃配色，携带浅色与深色两套值。背景采用原型自己的层叠，而不是一套相似渐变：晕云、两道倾斜飘带环与遮罩，沿用相同的模糊半径、transform、漂移动画与最终透明度。场层沿用参考级联的透明度（桌面 `0.4472` 浅 / `0.686` 深，紧凑布局 `0.387` / `0.588`）与 `saturate(0.86)`；晕云、飘带与远端飘带分别为 `0.7`、`0.65`、`0.24`，遮罩深色桌面 `0.52`、紧凑布局 `0.45`。位于 body 的场景元素以 `z-index: -1` 绘制在 body 背景之上、所有应用层之下，并在插件卸载时移除。场景透过应用框架显示，因此 `--dsw-app-frame-fill` 让本 profile 清空该框架。空白首页直接显示该环境光——hero 表面把 `--dsw-alias-bg-base` 重绑为 `transparent`——活跃会话清空根背景，使环境光延续到 session bar 与 composer 之后；会话正文的横向底色（`--dsw-brand-content-wash`）与 composer 淡出（`--dsw-brand-scene-base`）由 conversation 负责。全局页保留一层底色；输入框聚焦时晕云提升到完全不透明，与原型一致。

### 消费这套身份

其他包读取下列 token，而不是复制遂意配色；`ui-theme` 的 `brand-identity.css` 以中性默认值声明了同名 token，供其他 profile 使用。

| token | 用途 |
| --- | --- |
| `--dsw-brand-font-family` | 品牌字体栈（字标与标题面）。 |
| `--dsw-brand-title-weight` | 页面标题字重：本构建为 300。 |
| `--dsw-brand-wordmark-weight` / `-size` / `-tracking` / `-line-height` | 字标度量：500、22 px、0.04 em、1.4。 |
| `--dsw-brand-scene-base` / `-cyan` / `-blue` / `-ice` | 背景基色与三道晕带端点。 |
| `--dsw-brand-content-wash` | 会话列覆盖在光晕之上、保证内容可读的底色。 |
| `--dsw-brand-page-wash` | 插件中心、设置等全局页的覆盖底色。 |
| `--dsw-brand-scene-strength` / `-compact` | 桌面与紧凑布局的场层透明度。 |
| `--dsw-brand-scene-veil` / `-compact` | 桌面与紧凑布局的遮罩色调。 |
| `--dsw-brand-scene-veil-size` / `-position` / `-size-compact` / `-position-compact` / `-fade-compact` | 桌面与紧凑布局的遮罩几何。 |
| `--dsw-brand-composer-fill` / `-border` / `-shadow` | 输入框卡片材质（基础态）；阴影携带原型的内层边缘环与左侧高光。 |
| `--dsw-brand-composer-focus-fill` / `-focus-border` / `-focus-shadow` | 输入框卡片聚焦态材质。 |
| `--dsw-brand-composer-material-content` / `-sheen` / `-inner-border` / `-inner-shadow` | 独立的 2px 高光与半透明内边缘；装饰裁切不影响输入框浮层。 |
| `--dsw-brand-composer-placeholder-color` | 输入框占位文字颜色；原型弱化文字、85% 不透明度。 |
| `--dsw-brand-shortcut-fill` / `-border` / `-radius` / `-radius-compact` / `-shadow` | 首页快捷药丸（640 px 以下用紧凑圆角）。 |
| `--dsw-brand-glass-chrome` / `-nav` / `-toolbar` / `-edge` / `-shadow` | 边框行、导航、工具栏、边缘与投影的玻璃材质。 |
| `--dsw-brand-accent-ink` / `-soft` | 导航选中、设置分类与工作台标签共用的强调 ink/soft。 |
| `--dsw-brand-mark-glow` | 图形周围的艺术投影颜色。 |
| `--dsw-app-frame-fill` | 应用框架填充；本构建为 `transparent`，使一层背景场景铺满窗口。 |
| `--dsw-brand-mark-wing-1…4` / `-wake-1…4` | 图形渐变端点。 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

各填充作为声明感知的注册集安装：每个 `ctx.slots.inject()` 等待其声明方，因此无论本行在声明者之前还是之后激活都能工作；声明消失时随之撤回，HMR 期间也不会留下残缺的品牌混合。首页与回答前的 owner 类型来自 `ui-conversation` 与 `ui-chat`；`ui-chat` 未在客户端 entry 导出回答前图形的 owner 接口，因此该组件重述同一组字段。token 层通过 `ctx.effect()` 注册，插件卸载时随之移除。[`scope.ts`](src/client/scope.ts) 用同一套 effect 机制在文档 body 上设置 `data-dsh-brand="suiyi"`，并在卸载时还原先前的值；[`brand.css`](src/client/brand.css) 只按该属性选择，因此即使某个构建加载了本 bundle 却渲染其他 profile，它也保留自己的字体、玻璃与背景。样式表只引用 token，颜色值放在 [`tokens.ts`](src/client/tokens.ts) 中并携带两套调色板。浏览器半部是 [`src/client/index.ts`](src/client/index.ts)；node 半部是空的 Loader 席位。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当品牌面不够用时阅读以下页面。它们从本包占据的 slot 进入渲染这些 slot 的外壳。

- [ui-sidebar](../ui-sidebar/README.zh.md)——声明 `sidebar.brand.mark` 与 `sidebar.brand.name` 并渲染其回退。
- [ui-theme](../ui-theme/README.zh.md)——持有 `overrideTokens`、品牌身份 token 契约，以及本包叠加的离线字体样式表。
- [ui-brand-official](../ui-brand-official/README.zh.md)——通过 profile 分区共享这些 slot 的官方品牌填充。

-----

<a id="model-experience"></a>
## 模型体验

### 浏览器品牌呈现

#### 模型看到什么

无。本包用浏览器图形填充 `sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.brand.mark` 、`conversation.chat.assistant.mark` 与 `conversation.chat.waiting.mark`；不注册提示词段落、工具 schema 或模型可见文本。

#### Token 影响

无。本包不增加任何请求内容，因此不改变输入或输出 token 数。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了品牌呈现的供给方式。它们是当前包约束，不是品牌设计对比或任务积压。

- **只有一组填充**——替代呈现属于占据相同 slot 的另一个 Cordis 包。
- **profile 分区是构建期的**——构建 profile 内联进浏览器 bundle，一个 bundle 只携带一个品牌。
- **图形尺寸由各 slot 所有者决定**——侧栏请求 24 px、首页 96 px、回答前 32 px；图形按这些边长渲染，而不是原型的 42 px 侧栏标志，几何由各宿主的类负责。
- **光晕跟随平台背景**——macOS Desktop 为窗口材质保有透明 body，因此其框架保留平台材质。
- **框架必须消费该填充 token**——场景需要 AppFrame 以 `var(--dsw-alias-bg-base)` 为回退绘制 `--dsw-app-frame-fill`；若框架保持不透明，就会多出一层覆盖并压平场景。
- **减少动态效果**——系统偏好或应用的 `data-dsh-reduce-motion` 设置均会关闭漂移、指针变换、点击反馈与思考动效。
- **装饰性交互**——侧栏与首页标志随靠近的指针偏移，点击时播放短暂滑行与尾迹。外层测量框保持固定，点击仍执行宿主原有操作；插件卸载时清理监听器、动画帧与计时器。
- **浏览器标题独立**——`DSH_CLIENT_TITLE` 在构建时选择标题文本，而非通过 UI slot。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

图形与配色随包交付：`Brand.tsx` 包含飘带的五条内联矢量路径（主体、两处玻璃高光、尾迹与尾迹描边）、轨道环与无障碍标签；`brand.css` 包含环境光几何、各层透明度与动效；`tokens.ts` 提供浅色/深色配色、玻璃与场景值；`locale/` 字典提供标识与名称文案。飘带渐变读取 `--dsw-brand-mark-wing-*` 与 `--dsw-brand-mark-wake-*`，环境光读取 `--dsw-brand-scene-*` 契约。

</details>
