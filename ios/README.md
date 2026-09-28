# 接力 · NoteBaton iOS

SwiftUI App，最低 iOS 17。笔记保存在本机 SQLite；每个服务的身份分别保存在 Keychain。App 的欢迎页与配对页显示官方网站 `notebaton.org`，点击网站入口会打开系统浏览器；进入 **Note** 后扫码或复制配对链接。欢迎页也支持复制网址。扫码或粘贴配对链接后，仅连接用户确认的服务；仍可使用自己的部署。

## 模拟器

macOS 安装 Xcode，打开 `Clipboard.xcodeproj`，在窗口顶部运行按钮旁选择 **NoteBaton** Scheme，再选择 iPhone 模拟器，按 **⌘R** 运行。仓库已包含 Markdown 资源，无需先启动后端才能使用本机笔记。

工程包含两个独立的运行 Scheme：

| 运行平台 | 顶部 Scheme | 运行设备 |
| --- | --- | --- |
| iOS | `NoteBaton` | iPhone 真机或 iPhone 模拟器 |
| macOS | `NoteBatonMac` | My Mac |

左侧 **TARGETS** 只决定当前查看哪一套工程设置，不会切换顶部运行 Scheme。遇到“平台不匹配”时，先检查顶部 Scheme 和运行设备是否对应；例如，向 iPhone 安装时不能使用 `NoteBatonMac`。

```sh
./scripts/run-simulator.sh <Simulator-UDID>
```

模拟器正常运行保留本地签名，以支持 Keychain；CI 的无签名构建只用于编译检查，不用于运行验收。

## 语言

首次欢迎页及“配对与同步 → 高级设置”中可切换简体中文、英文或跟随系统，选择会保留。界面、连接状态、错误提示及离线隐私政策随语言切换，笔记正文不会被翻译。相机和本地网络权限说明通过 `en.lproj/InfoPlist.strings` 和 `zh-Hans.lproj/InfoPlist.strings` 提供中英文，`Info.plist` 保留英文默认值。系统权限弹窗遵循系统为 App 选择的语言；App 内的语言切换只控制应用界面，不会即时切换系统权限弹窗。Xcode 的权限编辑页显示默认说明，不会同时展示两种语言。

## 真机签名

复制本地配置模板，填写你自己的 Apple 开发者团队与唯一 Bundle ID：

```sh
cp Config/Signing.local.xcconfig.example Config/Signing.local.xcconfig
```

编辑 `Config/Signing.local.xcconfig` 中的 `DEVELOPMENT_TEAM` 和 `PRODUCT_BUNDLE_IDENTIFIER`。此文件已被 Git 忽略；不要提交签名证书或 Provisioning Profile，也不要将 Xcode 自动写入 `project.pbxproj` 的固定 Team ID 提交。`Config/Signing.xcconfig` 自动读取可选本地配置。

在 Xcode 顶部选择 **NoteBaton** Scheme，再选择已信任且启用 Developer Mode 的 iPhone 后运行，或执行：

```sh
./scripts/run-device.sh <iPhone-UDID>
```

安装脚本从构建产物读取实际 Bundle ID，支持你自己的签名配置。升级现有安装时，请保持原团队和 Bundle ID，以保留应用容器及 Keychain 访问权限。

本仓库提供本地开发与测试所需配置。App Store / TestFlight 的归档、签名、上传和审核资料由独立发布仓库维护，不放入此开源仓库。

## 生成与测试

翻译源在 `../shared/messages.json`，运行 `npm run build:locales`（在 `web/`）生成 `en.lproj` 和 `zh-Hans.lproj` 的字符串资源。不要直接修改生成文件。

`project.yml` 是工程配置源，修改后执行 `xcodegen generate`（需要 XcodeGen）。本地签名配置不写入生成工程。修改 Web 共享 Markdown 或更新依赖后，在 `../web` 运行 `npm ci && npm run build:app-resources`，一起提交生成的资源和许可声明。

```sh
./scripts/test-local-notes.sh
./scripts/test-pairing.sh
# 先在 web 目录 npm ci
./scripts/test-e2ee.sh
```

测试覆盖 SQLite 持久化、10 万字符、去重、冲突、分页、删除重试、旧数据迁移、服务链接解析、HTTP/WebSocket 重定向拦截。交互验收还需检查：配对、服务切换、前后台恢复、剪贴板权限、Markdown、相机扫码。镜像操作无法代替实体相机验收。

已发布客户端请从[官网下载入口](https://notebaton.org/download)获取；使用发布版不需要配置开发者团队。

## 使用与数据

- 首次“开始使用”进入本机笔记；输入即时保存，底部新建，编辑页返回保留内容。
- 默认只展示打开网站、扫码或粘贴链接的基础流程；自定义服务、授权管理和语言等选项在“高级设置”中展开。
- 配对链接自动识别网址；完整加密配对字符串需额外填写服务网址。确认后目标服务上的已授权网页可读取和编辑此手机的笔记。
- 可以保存和切换服务，一次连接一个，笔记仍是同一份本机库；移除网页权限需连接它所属服务。
- 相同剪贴板内容不重复创建；配对链接进入待确认流程，不自动作为笔记保存。
- 笔记没有云备份，卸载会删除本机数据。完整边界见 [SECURITY.md](../SECURITY.md)。

## 隐私政策

App 首次欢迎页和「配对与同步 → 高级设置」提供简体中文、英文隐私政策，正文打包在本机，无需连接服务。在 `../web` 运行 `npm run build:legal` 更新打包内容；开源副本使用不含发布者身份的草稿模板；正式 App 的发布资料在独立仓库中维护。模板说明见 [隐私政策与发布](../docs/隐私政策与发布.md)。

## 加密升级

3.0 使用 CryptoKit 与网页 Web Crypto 端到端加密。密钥保存在 Keychain，旧版配对需重新建立；本机笔记保留。必须连接协议 v3 服务，详见 [端到端加密说明](../docs/端到端加密.md)。

## 多台 iPhone 与 Mac（3.2）

支持原生设备双向复制本机笔记、离线编辑、重连补齐、删除传播与并发冲突副本。原有本机数据库会自动迁移，已有笔记及网页配对保留。更新 Worker 后，打开“配对与同步”，展开“连接另一台 iPhone 或 Mac”并生成本机配对码，首次使用会先确认服务网址；在已有 iPhone 扫码，或在 Mac 粘贴完整链接并授权。两台设备的全部笔记会合并。

可以配对多台原生设备。iOS 必须在前台；Mac App 运行时可持续连接。网页可由任一客户端授权，但仍需它绑定的设备在线。设备授权 1 年，网页授权 7 天；移除配对保留已同步的本机副本。详见 [同步协议与边界](../docs/多设备同步.md)。

macOS 14+ 使用同一 Xcode 工程中的 `NoteBatonMac` scheme，构建方法见 [Mac 安装](../macos/README.md)。

```sh
./scripts/test-replication.sh
# 启动本地 Worker 后，验证生产 Swift 核心与网页协议：
TEST_BASE_URL=http://127.0.0.1:8789 ./scripts/test-sync-integration.sh
```
