---
description: "插件中心的 Host 客户端：使用已验证账号令牌按用户访问目录与 MCP，持久保存添加/启用/停用/移除状态，并在派发前执行版本守卫。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-hub-client

[English](README.md) | 中文

## 概述

`dsh-plugin-hub-client` 是插件中心的 Host 半边。它验证平台冻结的 V1 目录，并为每个已启用的发布版本挂载一个独立 MCP 实例。目录、MCP 与调用请求都携带已验证账号的令牌，因此平台只授权该账号的目录行。`pluginHub` Remote 命名空间暴露 `catalog`、`refresh`、`watch`、`add`、`enable`、`disable` 与 `removeInstance`。Settings 按账号保存添加与活动决定并在重启后恢复；派发前守卫与插件中心端点都会重新验证发布版本授权。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

本包为所有内置语言导出展示元数据。只有请求包含凭据模板时，才加载可选的凭据包。

将本服务与 `dsh-mcp-manager`、`dsh-tools`、`dsh-settings` 以及一个凭据提供方一起挂载。插件中心在部署明确选择启用之前保持关闭。

```yaml
- id: plugin-hub
  name: '@deepseek-ai/dsh-plugin-hub-client'
  inject: [credentials]
  config:
    enabled: true
    platformUrl: https://hub.example.com
    # This account's user access token, resolved per request. Never an
    # installation-wide token.
    authorization: 'Bearer ${credential:SUIYI_USER_ACCESS_TOKEN}'
    # Verified login that owns this profile; issuer and subject come from the
    # validated ID token, never from a username or email.
    identity:
      issuer: https://sso.example.com/realms/identity
      subject: 0d5f3b7e-6f1c-4f7a-9c2d-1f0e8a6b4c31
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `false` | 明确选择启用；`false` 时不会访问平台，也不会挂载任何实例 |
| `platformUrl` | `''` | 平台源；启用时必填，必须是裸 http(s) 源 |
| `authorization` | `''` | 非桌面部署可选的静态用户 Authorization 值；`${credential:REF}` 令牌按请求解析 |
| `identity` | 缺省 | 登录账号的已验证 `{issuer, subject}`；启用时必填 |
| `refreshIntervalMs` | `60,000` | 目录轮询间隔；至少 1,000 毫秒 |
| `requestTimeoutMs` | `15,000` | 单次目录请求的截止时间 |
| `maxCatalogBytes` | `8,388,608` | 接受的最大目录响应体 |
| `authorizations` | `[]` | Host 管理的启用决定；通过 Settings 写入 |

`platformUrl`、`authorization` 与 `identity` 不是 volatile 字段：修改后在下次插件加载时生效。`authorizations` 是 volatile 字段，因为生命周期方法会通过 Settings 写入它；用户界面只应通过这些 Remote 方法间接编辑它。启用的插件中心缺少 `identity` 时会激活失败；没有当前用户令牌时它不提供目录、不挂载实例，并报告凭据错误，而不是提供一个未绑定账号或安装级凭据的目录。

已经验证登录的启动器可以省略 `identity` 字段，改为在 Host 进程环境中设置 `DSH_SUIYI_IDENTITY_ISSUER` 与 `DSH_SUIYI_IDENTITY_SUBJECT`；显式的 `identity` 优先。解析只读取启动快照的继承 `process` 层，因此项目或 Harness home 的 `.env` 文件不能冒用账号。

在遂意桌面端，`authorization` 留空。Electron 通过私有 Node IPC 通道把已验证的用户 access token 交给 Host 提供的 `ctx.suiyiAccess` 服务；插件中心在每次目录请求时读取当前令牌，并在建立 MCP 连接时使用当前令牌；替换令牌会重新挂载活动实例，使后续调用使用新令牌。令牌绝不会进入环境变量、argv、文件、日志、Settings、渲染层或子进程环境。Host 服务在重新登录后替换令牌，在过期或停止时清除；本包自身不刷新令牌。

### Remote 方法

`catalog()` 返回最后一次已提交的目录，不访问平台。`refresh()` 使用当前账号的令牌读取并验证目录，清理已缺失或发布版本已变化的决定，然后协调实例。两者都返回 `{plugins, catalogVersion, instances, enabled}`；`instances` 为每个目录行保存一个 `PluginInstanceView`，并保留每次挂载或清理失败，每个视图都携带 `added`。

生命周期方法会在其他所有操作之后串行执行；当该行不在最后一次已提交的目录中时，以 `plugin-hub/unknown-plugin` 拒绝：

| 方法 | 持久效果 | 运行效果 |
|---|---|---|
| `add(pluginId)` | 写入当前发布版本并标记 `enabled: false` | 停止任何活动实例；不注册工具 |
| `enable(pluginId)` | 写入或替换当前发布版本并标记 `enabled: true` | 启动实例；挂载失败保留 `enabled: true` 并报告 `error` |
| `disable(pluginId)` | 保留该行并标记 `enabled: false` | 将实例停止到静止；卸载失败保留可见错误 |
| `removeInstance(pluginId)` | 删除该行 | 将实例停止到静止；卸载失败保留可见错误 |

重启只挂载发布版本仍匹配目录的 `enabled: true` 行。`added: true` 且状态为 `disabled` 表示已添加但已停止；`added: false` 且状态为 `disabled` 表示从未添加或已移除。

`watch(signal)` 推送完整目录和实时连接状态，合并连续变化，并在订阅或插件释放时结束。浏览器使用现有 Remote 流管理器处理重连。

### 安全

一个 Host profile 只属于一个已验证账号。平台目录、每个 MCP 连接和每次调用都使用 `ctx.suiyiAccess` 中该账号的已验证 access token；平台从令牌派生 subject、组织、角色、授权与可见行，并在最终上游调用前重新检查授权。不会把安装级或管理员令牌用作用户凭据，令牌也绝不会跨越 Remote 边界或进入子进程环境。

`identity` 另外为该账号提供本地存储隔离；每条持久决定只保存其不透明作用域（issuer 与 subject 对的 SHA-256）。为其他身份写入的决定会在加载时被忽略，并在第一次成功刷新时从 Settings 中移除。该本地隔离不能替代平台的按用户授权；后端令牌仍是权威。启动器的身份绑定只读取继承的 `process` 层，因此 `.env` 文件无法替换账号。切换账号因此需要以新身份和新令牌启动新的 Host 进程；同一个 profile 绝不会继续提供上一个账号的目录或实例工具。

V1 的每个 Host 只代表其所有者。所有 Remote 方法都拒绝非所有者 Peer。模型工具还要求 Agent 回合有所有者归属：非所有者输入会禁止整个回合，后续所有者补充不能放宽该回合，无法归属的 Agent 也会被拒绝。没有 Agent 的受信进程内调用仍可用于内部集成。

平台地址、Authorization 头以及所有凭据值都留在 Host。跨越 Remote 边界的错误会被脱敏为失败类别；`plugin-hub/unavailable` 只报告 `network`、`timeout`、`http`、`unauthorized`、`invalid-response` 或 `too-large`，绝不携带地址或响应体。Host 会拒绝绝对地址、跨源地址或不属于该插件端点的 `mcpPath`，并且不跟随重定向，因此凭据不会被转发到其他源。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 —— 点击展开</summary>

[身份模块](src/identity.ts)把配置的 issuer 验证为规范 https URL、把 subject 验证为不含空白字符的非空令牌，再把身份哈希为随每条决定保存的作用域；原始身份值不会进入 Settings 或诊断信息。[访问契约](src/access.ts)声明桌面提供的当前令牌服务；[客户端](src/client.ts)在每次目录请求时读取它，并把得到的用户 Authorization 值发送给目录，同时使用严格的 Zod 对象验证目录，拒绝未知字段以及重复的 id 或工具名，根据冻结的工具列表推导每个公开工具名，并要求 `mcpPath` 等于 `/api/v1/plugins/<pluginId>/mcp?releaseVersion=<encodeURIComponent(releaseVersion)>`。解析出的地址必须保持平台源、精确的端点路径以及恰好一个 `releaseVersion` 查询字段。凭据模板按请求解析，从不缓存。

[实例所有者](src/instances.ts)为每个已启用行创建同一 Cordis 原生适配插件类型的独立 fiber；子插件只调用 `ctx.mcpManager.register`，因此 mcp-client 传输仍由 mcp-manager 拥有。释放子插件会等待注册 effect 回卷，而该回卷会等待 MCP 实例卸载；`disable` 只在其工具消失之后报告完成，遗留工具会被报告为清理失败而不是已完成的释放。命名空间把完整插件 id 哈希为 `hub_<20 hex>`，遇到冲突时拒绝，而不是把一个 id 截断成另一个。

退役命名空间会持续拒绝调用，直到替换实例成功启动。残留工具会阻止替换；挂载失败不会解除旧的拒绝规则。

[守卫](src/guard.ts)注册在 `ctx.tools.guard` 上，因此在每个 `tools/pre-execute` 监听器之后、工具主体之前运行。它会拒绝命名空间已退役、活动发布版本不再被授权，或公开工具名不在冻结允许列表内的调用。插件中心 MCP 端点会对每个请求重新验证授权，因此该守卫是纵深防御，而不是唯一的强制点。

[服务](src/index.ts)在一个队列上串行执行目录刷新、添加、启用、停用、removeInstance、恢复和释放。刷新失败不会改动上一次目录与已挂载实例。新的目录改变了或移除了某个发布版本时，会先撤回旧授权再卸载，因此排队中的调用无法针对过期的发布版本运行。释放会中止进行中的请求、排空排队工作，并等待每个子实例。

</details>

<a id="further-exploration"></a>
## 进一步探索

- [MCP manager](../mcp-manager/README.zh.md) — 拥有 mcp-client 实例、状态与重连。
- [MCP client](../mcp-client/README.zh.md) — 工具命名、模板解析与连接生命周期。
- [Settings](../../settings/settings/README.zh.md) — 本包通过它持久保存 volatile 配置。
- [Credentials](../../credentials/credentials/README.zh.md) — 引用解析与密钥存储。
- [Remote 调用模型](../../../docs/api-gateway.zh.md) — `@Remote` 方法如何跨越 Gateway。

<a id="model-experience"></a>
## 模型体验

### 间接的 MCP 工具贡献

#### 模型看到什么

每个已启用实例通过 mcp-client 以 `mcp__<namespace>__<tool>` 注册的已批准工具，以及冻结发布版本的 schema；本包本身不添加提示词段落。

#### Token 影响

条件性：每个已启用实例都会把其已批准的工具 schema 加入下一次请求；停用会移除它们。

#### KV Cache 影响

当已启用集合或某个发布版本的工具 schema 变化时替换；集合不变时可保持复用。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

这些限制描述本客户端目前无法做到的事情。它们是当前包的约束，而不是任务清单。

- **平台地址只能是源** — 不支持部署在路径前缀之下的平台；`platformUrl` 必须是裸源。
- **守卫是纵深防御** — 平台端点仍是强制点。端点若在 `allowedTools` 之外通告工具，该工具会在派发时被拒绝，但在实例重连之前仍会保持通告。
- **清理失败需要重启** — 无法确认传输关闭的 MCP 实例会在 mcp-manager 留下记录，阻止同一命名空间重新挂载，直到 DSH 重启；界面视图会报告错误。
- **发布版本变化需要重新启用** — 新的或变化的目录发布版本会撤回旧授权，而不是静默升级；用户需要重新启用当前发布版本。
- **仅限用户范围** — 启用状态保存在配置档的 Settings 文档中；本包没有共享或组织范围的启用机制。
- **替换令牌会重建 MCP 连接** — MCP 传输保留建立连接时的 Authorization 头，因此替换令牌会卸载并重新挂载活动实例；目录读取立即使用新令牌，旧连接上的进行中调用不会保留。
- **构建图在包外** — workspace 注册、tsconfig 聚合、bundle 与 lockfile 由主控负责；本包只声明自己的清单与项目引用。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

定向测试位于 `tests/` 下。使用本地 Vitest 二进制并在未设置 `NODE_USE_ENV_PROXY` 的情况下运行，因为 Node 会在 setup 文件有机会清除该标志之前采样它。组合测试会启动真实的 Loader 配置档，包含 mcp-manager、同时提供目录与 Streamable HTTP MCP 的无密钥平台测试服务、真实 Settings 持久化，并在同一配置档上重启。

</details>
