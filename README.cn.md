# NoteBaton

简体中文 · [English](README.md)

**在 iPhone 记下想法，在 Mac 或浏览器继续写。** NoteBaton 是以本机笔记为中心的文字工具，支持链接、Markdown、离线编辑，以及 iPhone、Mac 和网页之间的端到端加密同步。无需注册账号，也可以部署自己的同步服务。

[下载与使用](https://notebaton.org/download) · [打开网页版](https://notebaton.org/note) · [自部署](docs/自部署.md) · [iPhone 构建](ios/README.md) · [Mac 安装](macos/README.md)

## 功能

- **随手记录：** 新建、编辑、复制和删除纯文本、链接或 Markdown 笔记；输入时自动保存，支持 Markdown 预览和剪贴板快速导入。
- **跨设备接力：** iPhone 与 iPhone、iPhone 与 Mac 可以双向同步。每台原生设备都有自己的本地副本，离线修改和删除会在已配对设备再次同时在线时补齐；并发修改会保留冲突内容。
- **浏览器继续编辑：** 用二维码或完整配对链接授权网页，在浏览器读取和编辑已配对设备的笔记。网页需要该 iPhone 保持前台，或 Mac App 保持运行。
- **内容由设备保管：** 同步内容使用 AES-256-GCM 端到端加密；中转服务没有笔记解密密钥，也不持久保存笔记正文。配对链接包含密钥，请妥善保管。
- **按需部署：** 使用 [notebaton.org](https://notebaton.org) 或将网页与中转 API 部署到自己的 Cloudflare 账号。App 可保存多个服务地址并切换，切换后仍使用同一份本机笔记，无需为自部署重新编译。
- **中英文界面：** iPhone、Mac 和网页提供简体中文与英文；切换界面语言不会改动笔记内容。

本仓库维护源码、自部署服务和开发测试。已发布 App 由独立发布流程维护，仓库不包含安装包、签名材料或 App Store 审核资料。

## 开始使用

| 平台 | 获取方式 | 要求 |
| --- | --- | --- |
| iPhone | [官网下载入口](https://notebaton.org/download)；开发者可[用 Xcode 构建](ios/README.md) | iOS 17+；仅支持 iPhone |
| Mac | [下载已签名并公证的 DMG](https://notebaton.org/downloads/NoteBaton-macOS-1.0.0.dmg) | macOS 14+；Apple 芯片与 Intel |
| 网页 | 打开 [NoteBaton / Note](https://notebaton.org/note) 或自己的部署 | 需与在线的 iPhone 或 Mac 配对 |

1. 在 iPhone 或 Mac 打开 NoteBaton。新建笔记会直接保存在本机，不需要网络或账号。
2. 要在网页继续编辑，打开网站的 **Note** 页面并生成配对二维码或链接。在 App 的“配对与同步”中扫描或粘贴，核对完整服务网址后授权。
3. 要连接另一台 iPhone 或 Mac，让两台设备使用同一服务网址。在新设备生成设备配对码，再由已有设备扫描或粘贴并确认；双方笔记会合并。

网页授权最长 7 天，设备授权最长 1 年，配对码有效 5 分钟。iPhone 只在 App 前台同步；Mac App 运行时可以持续连接。原生设备可离线编辑，网页在已配对设备离线时无法读取新内容或保存修改。更多连接方式与冲突规则见[多设备同步说明](docs/多设备同步.md)。

## 部署自己的服务

需要 Node.js 22.12+、npm 和 Cloudflare 账号。克隆完整仓库后直接运行，无需填写运营者、App 开发者或隐私联系邮箱：

```sh
cd web
npm ci
npx wrangler login
npm run deploy -- --name my-notebaton
```

部署完成后打开终端显示的网址，直接进入笔记与配对界面。自部署仅包含笔记显示、编辑、配对、同步和中转 API，不包含官网首页、App 下载、隐私政策或用户协议页面，也不读取 `web/site.config.json`。后续更新使用同一个 Worker 名称和网址；更换域名需要重新配对。完整步骤见[自部署指南](docs/自部署.md)。

## 数据与安全边界

笔记正文持久保存在已同步的 iPhone 和 Mac；网页只在当前页面内存中保留已加载内容与未发送草稿。中转服务转发密文，并保存配对、授权和路由所需的元数据。公开连接还使用 HTTPS/WSS。

请只连接可信的网站并保管好配对链接。恶意网页代码或受入侵的设备仍可能读取端点上的明文；当前协议没有前向保密，也未经过独立密码学审计。同步不是备份：本项目没有云备份或账号找回，失去所有本地副本会丢失笔记。详见[加密设计](docs/端到端加密.md)、[安全说明](SECURITY.md)和[隐私政策](https://notebaton.org/app-privacy/)。

## 开发

```sh
cd web
npm ci
npm run typecheck
npm run build
npm run dev:api
# 另一个终端，在 web/ 目录：
TEST_BASE_URL=http://127.0.0.1:8787 npm test
```

默认 `npm run build` / `npm run deploy` 构建和部署自用笔记服务；官网使用独立的 `npm run build:site` / `npm run deploy:site`，输出与部署配置分离。官网发布资料见[隐私政策与发布](docs/隐私政策与发布.md)。

前端热更新运行 `npm run dev`；iOS 和 macOS 共用 `ios/Clipboard.xcodeproj`，分别选择 `NoteBaton` 与 `NoteBatonMac` scheme。测试与提交要求见[参与开发](CONTRIBUTING.md)。

- `ios/`：iPhone App、共享 Swift 同步核心、SQLite、Keychain 与双平台 Xcode 工程。
- `macos/`：Mac 界面、资源与安装说明。
- `web/`：React 网页、Cloudflare Worker、中转 API 与协议测试。
- `shared/messages.json`：App 与网页共用的中英文界面文案。
- `docs/`：部署、同步协议、加密设计及开源审查。

[API 协议](web/API.md) · [需求文档](需求文档.md) · [实施计划](实施计划.md)

## 许可

项目采用 [MIT License](LICENSE)。第三方组件遵循各自许可，见[第三方声明](THIRD_PARTY_NOTICES.txt)。
