# 遂意 Suiyi · 公开源码快照

[English](README.md) | 中文

这是遂意 Suiyi 的**独立公开源码快照**，用于在 GitHub Actions 的 `windows-2025` 运行器上构建
Windows x64 **未签名** NSIS 测试安装包。它不是私有开发仓库的历史副本，也不是正式发行版。

## 基线

- 来源私有源码提交：`d9ba3ec471177ff4f3ba295d9ce7f54b623e7795`
- 导出方式：在干净的私有工作树上执行 `git archive --format=tar HEAD`
- 本仓库从独立 root commit 开始，后续提交只更新经检查的公开快照，不包含私有 Git 历史
- 本仓库维护 `main` 作为公开构建分支；日常开发在私有仓库，更新时导出经过检查的源码快照
- 公开导出将指向已排除内部文件的链接保留为普通文字，并根据公开文件集重新生成双语配对记录
- 公开快照仅保留 Windows 打包所需的 `apps/`、`packages/`、`plugins/`、`native/`、
  `vendor/`、`python/`、`scripts/`、`patches/` 及完整锁文件
- 已排除 `.agents/`、`snapshots/`、`docs/`、`website/`、`benchmarks/`、私有 `.github/`
  工作流、内部代理说明、会话记录与内部发布脚本
- 依赖上述会话快照或文档站的测试/文档脚本未纳入，以避免发布快照内容；Windows 打包
  所需的源码、锁文件和工作流保持完整
- 已移除插件测试种子中的 `.env`，以及包含私人绝对路径的插件集成文档
- 遂意公开版默认 OIDC 身份中心标识为
  `https://sso.zzjjzz.top/realms/identity`；此地址为公开服务元数据，不包含认证密钥
- 根许可 `LICENSE` 与第三方许可原文保留；未声称全部第三方许可已完成法律审核

## 下载测试包

1. 打开本仓库的 **Actions** 页面。
2. 选择 **Build Windows x64 NSIS (unsigned)** 工作流的最新成功运行。
3. 在该运行的 **Artifacts** 中下载
   `suiyi-windows-x64-unsigned-<run_number>-<run_attempt>`。
4. Artifact 保留 **14 天**，包含实际安装包和 `SHA256SUMS.txt`。

安装包文件名由构建版本决定，格式为：

```text
suiyi-<build-version>-win-x64-unsigned.exe
SHA256SUMS.txt
```

工作流会校验 PE 机器类型为 `x64`（`0x8664`）、文件尺寸下限，以及
`Get-AuthenticodeSignature` 的状态必须为 `NotSigned`。**只有 GitHub Actions 运行成功且
artifact 上传成功后，才表示打包成功。**

## 构建配置

- 运行器：`windows-2025`
- Node.js `24`
- pnpm `11.28.5`（由根 `package.json` 的 `packageManager` 锁定）
- 依赖安装：`pnpm install --frozen-lockfile`
- 预检：`pnpm run package:desktop:win:x64:unsigned --check --build-version <version>`
- 构建：`pnpm run package:desktop:win:x64:unsigned --build-version <version>`
- `DSH_DESKTOP_FLAVOR=suiyi`
- `DSH_DESKTOP_APP_ID=com.zzjjzz.suiyi`
- `DSH_DESKTOP_AUTO_UPDATE_ENV=test`
- `DSH_DESKTOP_WINDOWS_PACK_CONCURRENCY=2`
- `DSH_DESKTOP_WINDOWS_COMPRESSION_LEVEL=3`
- `DSH_TELEMETRY_DISABLED=1`
- 测试策略保留域名：`https://policy.example.invalid`；登录身份中心：`https://sso.zzjjzz.top/realms/identity`
- 权限：仅 `contents: read`
- 触发：仅 `push` 到 `main` 与手动 `workflow_dispatch`
- 不使用 `pull_request_target`、私有 checkout、token、self-hosted runner 或生产密钥

## 安全边界与限制

- **未签名、未做正式发行验收。** Windows 可能显示 SmartScreen 警告；不得把此包描述为
  已签名、生产可用或已通过真实身份提供商验收的正式版本。
- 公开版内置真实的 HTTPS 身份中心地址，但这仅表示登录服务可发现，**不保证账号授权或桌面登录已经验收**。
  目标身份中心仍须允许 `suiyi-desktop` 客户端的授权码与本地回调；未来变更服务地址时，
  可通过 `suiyi-oidc-issuer.json` 覆盖默认值，不需要把任何密钥写入公开仓库。
- 工作流只构建并做 PE、尺寸、签名状态和 SHA-256 校验，不执行真实 SSO 登录，也不替代
  独立的 Windows 安装/运行验收。
- 本公开仓库不上传安装包到 release、对象存储或自动更新服务。
- 构建产物是测试工件，不应作为正式发行版分发。

## 扫描记录

发布前在导出目录执行了：

```text
gitleaks 8.30.1 dir . --redact --gitleaks-ignore-path .gitleaksignore
```

并对本地用户主目录路径、私有域名、私有仓库路径、私钥块、常见云令牌格式和内部 RFC 1918
地址进行了文本扫描。5 条 Gitleaks 初始命中均位于测试夹具和
`patches/lexical@0.49.0.patch` 的压缩代码块中；没有真实凭据。对应指纹记录在
`.gitleaksignore`，不采用整目录或整类规则的宽泛豁免。最终扫描无真实秘密命中。

扫描通过不代表对所有第三方代码、素材或依赖许可证做了穷尽审计。发现真实秘密或敏感数据时，
应停止发布并通过仓库的私密安全渠道报告，不要在公开 issue 中粘贴秘密值。

## 许可

根项目采用 MIT，见 [`LICENSE`](LICENSE)。`vendor/` 内各组件保留上游 MIT 许可；
`plugins/dsh-generative-ui/` 保留其 Apache-2.0 `LICENSE` 与 `NOTICE`；其他第三方依赖
分别受其自身许可证约束，详见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)、各包内
许可文件和锁文件。此快照不对完整许可证合规作最终法律结论。
