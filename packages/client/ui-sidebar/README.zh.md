---
description: "dsh Web 客户端的侧边栏外壳插件：品牌行、New Session 操作、折叠控件、可感知滚动的区域席位与底部固定的 Settings 席位。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar

[English](README.md) | 中文

桌面端产品事件使用可选的[产品埋点服务](../product-analytics/README.zh.md)，不包含普通 Web 交互。

## 概述

dsh Web 客户端的侧边栏让用户识别当前构建、启动新会话、将导航折叠为 56px 轨道、浏览 Workspace 与 Session，以及打开 Settings。它会将 Settings 入口固定在底部，并在隐藏空闲滚动条时避免浏览器行发生位移。New Session 优先使用显式选择的 Workspace，其次使用当前 Session 所属的 Workspace，再其次使用最近活跃的 Workspace；如果都不存在，则打开空白的 New Session 页面。部署可以替换品牌标记或名称，同时保留导航控件和轨道几何。

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

遂意将工作空间选择保留在对话区域左上角，不在一级导航中显示工作空间。更多功能打开居中玻璃弹窗，包含可用面板操作以及已注册的对话搜索、设置命令，自动化任务默认保留为一级导航入口，不添加仅用于原型演示的入口。

侧边栏是导航外壳：用户看到品牌、启动新会话、折叠轨道并到达 Settings。功能插件填充它的席位——ui-workspace 填充 `sidebar.workspaces`，ui-settings 在 `sidebar.settings` 注册触发行与设置面板。

宽度低于 640px 且没有原生 Windows 顶栏时，侧边栏在框架抽屉内保留展开内容。抽屉首先聚焦收起按钮，并限制键盘焦点范围，支持 Escape 和点击蒙层关闭，并在没有上层弹窗时将焦点还给打开它的控件。打开的抽屉切换为收起图标栏时，仍在展开内容中的焦点会在该内容卸载前转交给图标栏开关。收起的图标栏变为隐藏抽屉时，侧栏将自身焦点转交给顶部展开按钮，保留其他区域和上层弹窗的焦点。这也包括由原侧栏控件的 `aria-controls` 标识的全局菜单中的焦点。关闭的抽屉切回图标栏时，立即使用紧凑布局，不播放交叉淡入淡出。开关的提示气泡在抽屉外渲染。打开的抽屉使用原型玻璃色调与 24px 背景模糊，右缘保留一条细线；遮罩以 27% 黑色与 4px 模糊压暗页面，底层文字不可读但形状仍保留。遂意抽屉的水平内边距为 16px、底部内边距为 18px；48px 新建会话卡片使用 550 字重与模糊玻璃表面。关闭控件仍在品牌行内。打开抽屉不改变会话宽度。

### 品牌与 New Session

侧边栏完全隐藏时，Web 的标题栏只显示展开侧边栏按钮。挂载该标题栏插槽的桌面宿主还会保留新建会话按钮；带有原生标题栏的 Windows 客户端则在原生标题栏中保留该按钮。

展开的品牌行把 `sidebar.brand.mark` 与 `sidebar.brand.name` 渲染为两个独立的 single slot；收起轨道则渲染同一个 mark slot。在 Web 和 Windows 桌面端，点击展开态的品牌会新建会话，悬停或聚焦时不显示 tooltip。没有占位者时，外壳使用鱼形标记和本地化的本地构建标签。完整构建会在标签下方显示代码徽标；该徽标使用 `DSH_CLIENT_VERSION`、可选的 7 位 `DSH_CLIENT_COMMIT_HASH` 与 `DSH_CLIENT_GIT_DIRTY=true` 组装成 `version[-commit][-dirty]`；缺少版本元数据时不显示徽标。此类构建中点击回退的标记或标签会复制该徽标文本而非新建会话，macOS 桌面端同样适用；写入成功后弹出“版本号复制成功”toast。New Session 优先使用作用域操作明确指定的 Workspace，否则使用当前 Session 所属 Workspace，再否则使用最近活跃 Workspace；一个 Workspace 都没有时则清空选择，进入空白 New Session 页面。 展开态的新建会话按钮在键盘聚焦时于右侧以灰色文字显示当前有效绑定，不受设备悬停能力限制；支持悬停的设备也会在悬停时显示。快捷键可见且空间较窄时，居中的图标与文字在快捷键之前渐隐；CSS 为快捷键保留宽度，无需测量按钮。纯图标控件保留使用平台键位样式的 tooltip，侧栏隐藏时常驻的 macOS 头部控件也保持一致。所有控件均提供 `aria-keyshortcuts`。全局访问快照不含 `session/create` 时，品牌行不可点击，New Session 按钮和窗口标题栏中的 New Session 控件都不渲染；每个新建请求仍由 Host 判定。

### 搜索与对话

普通 Web 只有一个侧栏开关：它位于全局工具栏中导航列的右边缘（标题在其后），不再占用 logo 行。低于 641px 时，抽屉的前导控件是唯一打开入口，打开后的抽屉保留自己的关闭控件。Windows 与 macOS 继续使用各自标题栏中的控件。新建会话为 48px 玻璃表面卡片，带蓝色加号；一级导航行使用次级文字色，选中行使用浅品牌底色。 遂意侧栏开关使用 9px 圆角；悬停时显示抬升表面与主文字色；键盘聚焦时显示 2px 实线蓝色轮廓，外侧留出 4px 间隔。

底部保留真实的设置与账号席位：`sidebar.settings` 拥有触发器及其账号启动器，shell 只在其上方绘制分隔线。

在导航行上方，shell 仅在展开且存在占用方时渲染 root 作用域的 `sidebar.search` 席位；ui-workspace 在其中注册一个全宽触发器，通过与 `session.search` 命令相同的请求打开浏览器搜索。固定的“对话”行通过选择对话（`selectPanel(null)`）从全局面板返回当前会话；收起的图标栏以 36px 控件保留同一目标。该行属于 shell，不是面板注册项。

### 全局面板入口

插件在 root 作用域的 `sidebar.panellist` list 中注册图标组件，提供 `id`、可选 `order`，以及字符串或 locale-aware 的 `label`。同一个 id 寻址布局中 root 作用域 `main` keyed slot 的组件；选择不存在的主面板条目会抛错，并保留当前选中态。标签提供普通可见文字、无障碍名称和折叠提示。展开态导航行高 41px，间距为 4px；折叠窄栏控件保持 36px 高和 12px 间距。自动化任务默认收进“更多”，不作为一级导航行。每一行通过 `usePanelInfo` 读取自己的选中态；DOM 焦点移到搜索框或目录选择器时，显示的面板及其列表项选中态不变。没有面板注册项时，列表及其间距均不渲染。产品随附的组合不注册示例面板。

root 作用域的 `sidebar.panellist.actions` list 有注册项时，导航区域的面板行之后显示面板行样式的**更多**按钮；收起的窄栏以提示框显示其名称。它打开的菜单以该 list 的注册项为菜单行。每个注册项接收 `entries`（按注册顺序的可自定义面板，含 `id`、`label`、`pinned` 与 `active`；不含插件管理）、选中面板的 `onOpen(id)`、`onPinnedChange(id, pinned)`，以及关闭菜单的 `onDismiss()`。侧边栏在内存中保存所有会话共用的已收起面板 id 列表；插件管理入口始终显示。更多按钮显示时，展开态中除插件管理外的面板行在悬停或键盘聚焦时显示取消固定操作；不支持悬停的设备始终显示该操作。图标默认颜色与会话置顶标记一致，提示为“从左侧栏取消固定”。侧栏和更多菜单入口遵循相同的注册排序，不按固定时间重排。默认更多菜单在插件浏览和创建之前仅列出未固定的面板；打开面板不会将其固定，独立的固定图标则将该行放回侧边栏并关闭菜单。插件重新加载时选择重置，不读取旧 localStorage 值。收起只隐藏导航行，且仅在更多按钮显示时生效；`sidebar.panellist.actions` 没有注册项时，所有已注册的面板行重新显示。主面板、其注册和当前选中态不变。未注册面板的 id 保留在内存列表中，直到插件重新加载。

### 折叠行为

侧栏及会话头部的开关从命令目录读取当前有效快捷键，用于悬停、键盘聚焦提示和 `aria-keyshortcuts`。未绑定的命令只显示操作名称。

侧栏收起时，顶部展开按钮承载可选、不可交互的 `sidebar.toggle.badge` slot。占用方提供状态和提示内容，不增加操作，也不改变按钮的导航行为。

展开内容跟随框架的列宽及其过渡。实时收起时，内容固定在展开宽度淡出，上方控件共用同一段透明度渐变，并向左平移进入 56px 轨道，由布局的栏滑动结束整段动画。页面初始即为收起状态时会静态渲染轨道；减少动态效果模式会禁用两段过渡。固定在底部的 `sidebar.settings` 控件共用相同的透明度渐变时序，但不发生横向位移。

在 Windows Electron 中，`html[data-windows-titlebar]` 将两种状态下的侧栏开关固定在顶栏左上角，仅在展开态与新建会话按钮左边缘对齐。展开态品牌位于顶栏下方、新建会话按钮上方，按钮上方额外留出 8px。收起后，品牌和侧栏内容隐藏，新建会话按钮排在侧栏开关与 Desktop 菜单之间。侧栏在收起态将根元素的 `--dsh-windows-menu-start` 设为 84px；Desktop preload 使用它将菜单放在新建会话之后，展开态默认为 48px。顶栏图标按钮采用紧凑控件圆角的 28px 控件，图标为居中 16px，并从窗口拖拽区域中排除。遂意则把开关放入 62px 全局工具栏：x 为侧栏宽度加 24px、y 为 14px，控件为 33px；收起后的新建会话按钮位于 x64/y14，工具栏左侧预留随之加宽。Desktop 菜单内嵌在该工具栏中，不再另占一行。展开态品牌沿用普通布局的 82px 行高、偏移和字重；新建会话不附加标题栏专用的顶部外边距。侧栏开关与新建会话的悬停提示在顶栏下方展开，Desktop 菜单文字不会盖住它们；占用 `sidebar.toggle.badge` 的控件自行决定气泡展开方向。

### macOS 桌面

在 `html[data-platform='darwin']`（仅由桌面 preload 设置）下，展开的侧边栏列顶部有一条 52px 的顶部条：避开 hiddenInset 红绿灯并承载收起按钮；顶部条与其下的 logo 行各自打上 `data-window-drag`，于是每行自己的盒子就是窗口的拖拽区（唯一的 darwin drag 规则由 ui-web base.css 声明），因此品牌 wordmark 在 macOS 上不再是 New Session 快捷入口——专用的 New Session 按钮保留该操作；收起时整列隐藏而非保留轨道。本包向框架的 `shell.leading` 窗口 chrome 座（ui-layout）注册 `HeaderLeadingControls`——打开侧边栏与 New Session 两个控件，由框架仅在列隐藏时挂载于红绿灯旁，覆盖所有主面板。[Desktop 参考](../../../apps/desktop/README.zh.md)负责窗口集成。

### 滚动条

栏内的滚动条是一种指针可供性：只要指针不在栏内，外壳就把滚动条间接层重新绑定为 `transparent`；指针离开后滑块再保留 2 秒，因此没人指向的列表不会带着滚动条。避免行位移的空间预留属于滚动区域本身（ui-workspace），所以显示滑块不会引起重排。

### 点击埋点

在桌面端，官方导航控件在执行操作前上报 `sidebar_menu_click`，携带 `menu_name` 与 `position`。没有埋点服务时，这些控件只执行导航。通过其他途径选中面板不上报，侧边栏也不上报曝光事件。

- 展开态品牌与新建会话按钮上报 `menu_name=new_session`、`position=sidebar`。Windows 顶栏承载收起态新建会话按钮时，该按钮上报 `position=titlebar`；macOS 红绿灯旁的新建会话控件同样上报 `position=titlebar`。
- **插件**与**自动化任务**面板行分别上报 `menu_name=plugin` 与 `menu_name=cron`，`position=sidebar`。其他面板行不上报。
- 每次点击**更多**按钮都上报 `menu_name=more`、`position=sidebar`，无论打开还是关闭菜单。
- 更多菜单行通过 `onOpen(id)` 打开插件或自动化任务时，上报 `menu_name=plugin` 或 `menu_name=cron`，`position=sidebar_more`。随产品提供的更多菜单通过 `onOpen` 打开未固定的面板，包括自动化任务；固定和取消固定操作不上报导航点击。上报先于注册检查，因此所请求的面板已注销时仍会计数，但不会选中任何面板。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

外壳是纯组合：`SidebarRootComponentProps` 组合布局 owner share、全局 `useSessions` 与 `useWorkspaces` 钩子、已声明的品牌、`sidebar.workspaces` 与 `sidebar.settings` 子 slot，以及注入的导航回调。侧边栏声明 `sidebar.panel.icon` Component Factory，由它拥有 `sidebar.panellist` list；面板行和更多菜单都通过该 factory 渲染面板注册的图标。面板元数据由列表注册和 locale 变化派生；选中态属于布局存储。注入的 `trackEntryClick(attributes)` 转发到 `ctx.get('productAnalytics')?.track('sidebar_menu_click', attributes)`；`selectPanel` 只负责选中，因此由各控件自行提供入口与位置。

展开态导航使用原型的 15px 外侧留白、13px 行内距，前置单元宽 18px，与标签间隔 12px。新会话为 48px 全宽操作卡，无左右外边距，加号与文字左对齐。搜索行高 58px。logo 行无底部外边距；内容从侧栏左边缘向内 28px 开始，42px 标识按钮内为 32px 飘带，与 22px 字标间隔 7px。底部分隔线距设置/账号席位 9px，并留 12px 内距。仅 macOS 非全屏、侧栏展开时，顶部开关向右偏移 4px，并在整个淡出期间保持该偏移。折叠态尺寸独立保留。

展开态的面板导航与 `sidebar.workspaces` 区块共用一个仅纵向滚动的视口，位于固定的品牌和新会话控件下方；底部操作与设置位于视口之外。横向溢出被裁切，工具栏边缘偏移不会产生横向滚动条。视口隐藏自身滚动条，只负责把导航滚走：区块最高为一个视口，在自己的滚动容器中滚动列表行，并由该容器绘制唯一可见的滚动条；区块放得下时，视口没有可滚动的距离。展开时视口带有 `data-sidebar-scrollport`，这是供测试和集成方定位的稳定标记。外壳负责底部渐隐。

向下滚动时先把导航滚走，再滚动区块；向上滚动时先让区块回到顶部，导航再重新出现。如果一次滚轮或触控板手势的第一个事件需要移动视口，或者手势从区块滚动容器之外开始，JavaScript 会在整次手势（包括惯性）结束前一直把滚动量分配给两者，因此一次手势可以越过边界；间隔不足 100ms 的滚轮事件视为同一次手势。区块滚动容器能独自处理的手势保持浏览器原生滚动；不可取消的原生手势到达区块滚动容器顶部时，剩余距离交给视口。已被其他监听器取消的事件、双指缩放（Ctrl）事件以及以横向为主的滚轮事件保持浏览器原生滚动。视口内的内容不得自带纵向滚动，除非它自己取消这些滚轮事件。区块通过 `sidebar.workspaces` 获得这项能力：每次渲染都会提供 `hookContext.useSectionScroller`，同一个侧边栏中，占用者调用 `useSectionScroller()` 始终得到同一个 `{ bindScrollerRef }` 对象。未绑定滚动容器的占用者保持原生滚动。视口外层的区域是高度与视口相同的尺寸容器，视口本身是滚动状态容器，因此区块的滚动容器可以在视口滚到底之前拒绝原生滚动。

侧边栏根节点向 `sidebar.workspaces` 与 `sidebar.settings` 提供可继承的 CSS 属性：`--dsh-sidebar-inline-padding: 8px`、`--dsh-sidebar-row-padding: 12px`、`--dsh-sidebar-label-gap: 6px` 和 `--dsh-sidebar-paint-inset: 3px`。占用者使用这些值对齐展开态行；独立组合必须在祖先节点提供这些值。底色内缩不移动内容：行从左右内边距中减去该内缩值，并以等宽透明边框承载内缩。展开态视口隐藏自身滚动条；其尾部网格列使导航和区块与侧栏边缘保持 8px，区块的滚动容器把滚动条放在距该边缘 2px 处。

### slot 纪律

声明感知的 `slots.inject()` 让替换包无论先于还是后于侧边栏激活都能生效。页脚承载 `sidebar.settings` 席位：侧边栏只渲染固定在底部的布局 slot，并共享其栏状态（`wide`）。`/client` 导出接口只包含插件主体（`apply`/`inject`）及约定类型；SidebarRoot、行组件与树派生仍由 slot 注册封装在包内。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面覆盖填充外壳席位的各个界面与组合模型。

- [ui-workspace](../ui-workspace/README.zh.md)——渲染到 `sidebar.workspaces` 的 Workspace 与 Session 浏览器。
- [ui-settings](../ui-settings/README.zh.md)——在 `sidebar.settings` 注册触发行与设置面板的设置领域底座。
- [ui-layout](../ui-layout/README.zh.md)——折叠所使用轨道与栏状态的布局 owner。
- [ui-theme](../ui-theme/README.zh.md)——外壳所重新绑定的滚动条 token 间接层。
- slot 系统标准——席位背后的组合模型。

-----

<a id="model-experience"></a>
## 模型体验

无。该包是浏览器端 UI 插件层，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制定义外壳拥有什么、其占位方拥有什么；它们是当前包约束。

- **Session 状态点渲染由 ui-workspace 持有**：本外壳没有可用的 done/error 通知数据源。
- **Workspace 浏览行为由组合持有**：分组、排序、搜索与行状态都属于 ui-workspace，不属于此外壳。
- **「New task completed」未读标记是本地查看状态**：完成时间 > 上次查看时间这一事实永远不会到达宿主。
- **复制本地构建版本号仅支持鼠标**：键盘激活品牌会新建会话。
- **只有滚轮和触控板输入能在一次手势中越过导航边界**：触摸拖动保持浏览器原生的嵌套滚动，在视口滚到底时停止；不支持滚动状态容器查询的浏览器会先滚动区块。由 JavaScript 分配的滚轮步进在主线程执行，没有平滑滚动动画，也没有越界回弹。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
