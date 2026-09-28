# NoteBaton for macOS

原生 SwiftUI Mac App，最低 macOS 14。与 iOS 共用 SQLite、端到端加密、设备同步和 Markdown 实现。支持离线编辑、系统剪贴板、Markdown 预览、中英文和设备授权管理。

## 下载与安装

从 [官网下载 NoteBaton 1.0.0](https://notebaton.org/downloads/NoteBaton-macOS-1.0.0.dmg)，打开 DMG，将左侧 NoteBaton 拖到右侧 Applications（应用程序），然后从“应用程序”启动。最低 macOS 14，Apple 芯片和 Intel 共用同一安装包。

## 构建与运行

在 Xcode 打开 `../ios/Clipboard.xcodeproj`，顶部 **Scheme 选择 `NoteBatonMac`**，运行目标选择 **My Mac**，按 `⌘R`。`NoteBaton` 是 iOS target，选择它时应使用 iPhone 或 iOS Simulator；不要给它添加 macOS 平台。两个 target 共用部分代码，macOS 界面仅属于 `NoteBatonMac`。

```sh
# 仓库根目录，需要 Xcode；工程已提交，不必安装 XcodeGen。
xcodebuild -project ios/Clipboard.xcodeproj -scheme NoteBatonMac \
  -configuration Debug -derivedDataPath /tmp/notebaton-mac build
open /tmp/notebaton-mac/Build/Products/Debug/NoteBaton.app
```

开发构建读取 `ios/Config/Signing.local.xcconfig` 中的 Team，并使用 Apple Development 自动签名；未配置 Team 的 CI 可通过 `CODE_SIGNING_ALLOWED=NO` 构建。官网分发需要 Developer ID 签名与 Apple 公证。官网提供的 1.0.0 App 使用 Developer ID 签名和 Hardened Runtime，已通过 Apple 公证并附加公证票据，支持 Apple 芯片和 Intel Mac。macOS 本地数据位于 `~/Library/Application Support/NoteBaton/Notes/`，凭证保存在系统 Keychain。保持 Bundle ID 和签名身份稳定，以保留 Keychain 访问权限。

- `⌘N` 新建笔记；`⌘,` 打开配对；`⇧⌘V` 导入剪贴板。
- App 启动后常驻系统菜单栏，可查看同步状态、打开主窗口或退出。关闭主窗口、切换到其他 App 后仍可同步；从菜单选择“退出 NoteBaton”、按 `⌘Q` 或 Mac 休眠时停止。重新运行或恢复网络后自动补齐。
- 相机扫码仅在 iOS 提供；Mac 粘贴完整配对链接，也可显示二维码供 iPhone 扫描。

配对页默认只显示打开网站、粘贴链接两步；网站入口直接打开系统浏览器。自定义服务、已保存服务、授权管理、语言及隐私说明位于默认收起的“高级设置”，点击整行即可展开。

## iPhone + Mac + Web

1. 所有原生设备连接同一服务网址（需更新至支持 `replicaVersion: 1` 的 Worker）。
2. 打开“配对与同步”，展开“连接另一台 iPhone 或 Mac”，选择“生成本机配对码”。首次使用会先确认同步服务，再生成配对码。
3. 在已有设备扫描或粘贴新设备的完整配对链接。Mac 右下角的“配对（Pair）”按钮会启用，点击后核对域名并授权；显示“连接成功”后再点“完成（Done）”关闭。失败时窗口保留链接并显示原因。双方笔记会合并，各自保留本机副本。
4. 网页生成二维码或链接，在任一原生设备授权。网页访问的是该设备的副本；该副本的修改会沿设备连接继续同步。

每条设备连接都可双向同步。一台设备可以连接多台设备。建议将日常保持运行的 Mac 与各台 iPhone 分别配对；两台 iPhone 也可直接配对。若只连接 A–B–C，A 与 C 之间需要 B 在线中转；要在 B 离线时继续交换，可另建 A–C 连接。没有云端排队或自动发现，所有设备离线时服务不保存笔记。网页仍需其授权设备在线，不能自动切换到其他设备。

离线可编辑；并发不同文本会保留独立副本，删除标记防止旧记录复活。删除与离线编辑同时发生时，原笔记删除，未同步编辑保留为另一条。移除配对保留已同步副本，不能远程擦除另一台设备。同步不能替代备份。

设备授权 1 年、网页授权 7 天、配对码 5 分钟。密钥从不发送给中转 API。详见 [同步协议](../docs/多设备同步.md)。

## 开源仓库范围

本仓库保留客户端源码、本地开发和测试流程。已发布 App 从官网获取；安装包、Developer ID 签名、公证及 DMG 打包流程由独立的发布仓库维护。请勿将发布产物或签名材料加入此仓库。
