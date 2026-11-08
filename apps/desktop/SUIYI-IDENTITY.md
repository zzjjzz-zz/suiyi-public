# 遂意 Windows 身份隔离

构建必须在 `apps/desktop/.env.windows` 显式配置 `DSH_DESKTOP_FLAVOR=suiyi` 和 `DSH_DESKTOP_APP_ID=com.zzjjzz.suiyi`，再执行 `pnpm run package:desktop:win:x64:unsigned`。未设置 flavor 时保持 official，签名状态不选择产品。遂意主进程 bundle 内联 flavor；安装清单不匹配则启动失败。未来签名包仍使用同一 flavor，本轮不修改签名机。

遂意名称为 Suiyi，界面显示遂意 Suiyi，程序为 `Suiyi.exe`，协议为 `suiyi://`。NSIS 使用独立 AppId 派生 GUID 和注册表键。应用清单 name 为 `suiyi-desktop`，因此更新缓存名也独立。版权及内核包名保留。

`%APPDATA%/Suiyi/` 下的 `electron`、`chromium`、`dsh-home`、`agents-home` 是同级目录；在首次 userData/logs 访问和单实例锁之前设置。拒绝这些目录的链接或 junction。Host 环境移除继承的 DSH 配置，再固定自己的 DSH_HOME、DSH_AGENTS_HOME；不迁移 `~/.dsh` 或 `~/.agents`。用户可通过现有目录选择器选择与其他产品相同的项目源码目录；项目文件和项目内显式配置会按用户选择共享，默认产品内部状态不会共享。

本轮遂意禁用 CLI 安装/修复/卸载入口，保留现有 dsh.cmd 和 PATH；内部运行时仍可携带原版技术启动文件。遂意不生成更新 feed，不运行自动更新或强制更新策略，不生成上游正式发布记录。尚未配置遂意可信独立更新服务，签名也不会自动开启更新。未签名产物仅供测试，不能作为正式分发包。

遂意卸载器保留全部应用数据与智能体工作数据；绕过原版的 package-name、APPDATA、LOCALAPPDATA 清理逻辑。安装文件仍由 NSIS 按独立安装目录删除。失败、回滚、锁定文件和真实双产品共存仍需 Windows 安装验证；Linux 配置/生命周期模型测试不代表 Windows 验收。

现有 GitHub Windows hosted workflow 已显式选择 flavor，并精确匹配 `suiyi-<version>-win-x64-unsigned.exe`、`Suiyi.exe`、`Uninstall Suiyi.exe`。本轮不触发 CI。用户提供的运行 42256013380 / job 128205387735 在 runner 分配前因账户付款/支出额度失败；这是计费阻断，需由用户处理后独立构建验收。
