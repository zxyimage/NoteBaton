# 参与开发

较大的功能变更先开 Issue 说明需求、兼容性影响和验证方式。缺陷报告请使用虚构笔记复现，附系统、浏览器、App 版本及复现步骤；安全问题请按 [SECURITY.md](SECURITY.md) 私密报告。

## 本地开发

需要 Node.js 22.12+；iOS 开发需要 macOS、Xcode，修改工程配置还需 XcodeGen。

```sh
cd web
npm ci
npm run typecheck
npm run build
npm run dev:api
```

另一个终端执行 `cd web && TEST_BASE_URL=http://127.0.0.1:8787 npm test`。前端开发使用 `npm run dev`，通过 Vite 代理连接本地 Worker。`npm test` 的 API 用例需要服务已启动。不要将测试指向他人的服务。

```sh
# 仓库根目录
./ios/scripts/test-local-notes.sh
./ios/scripts/test-replication.sh
./ios/scripts/test-pairing.sh
./ios/scripts/test-e2ee.sh
node scripts/check-public-files.mjs
```

[iOS 安装与签名](ios/README.md) · [自部署](docs/自部署.md) · [API 协议](web/API.md)

## 提交要求

- 保持改动聚焦；说明解决的问题、测试结果和已知限制。
- 不提交真实笔记、配对码、令牌、签名材料、设备数据或开发者本地配置。
- 不提交 App 安装包、App Store 审核资料、正式发布记录或维护者身份。`web/site.config.json` 中的姓名与联系邮箱保持 `null`；公开 GitHub 和官网地址以及第三方许可署名保留。App 发布在独立仓库维护。
- 提交前运行 `node --test scripts/tests/check-public-files.test.mjs && node scripts/check-public-files.mjs`，检查固定 Team ID、个人证书、账号资料和发布产物。
- `ios/project.yml` 是 Xcode 工程来源，修改后运行 `cd ios && xcodegen generate`，一起提交生成的工程。
- 更新依赖后提交 `package-lock.json`，运行 `npm run build:app-resources`，一起提交自动生成的第三方许可和 iOS Markdown 资源。CI 检查生成结果是否与源码一致。
- `web/worker-configuration.d.ts` 通过 `npm run cf:typegen` 生成，使用无凭证的示例环境。
- 保留 Durable Objects 迁移历史；协议变更需要考虑已安装的客户端和已配对网页。
- 涉及正文流转的变更不能将笔记写入后端持久存储、日志、URL 或 WebSocket 附件。

macOS 使用同一工程的 `NoteBatonMac` scheme。涉及同步时还需启动隔离本地 Worker，并运行 `TEST_BASE_URL=http://127.0.0.1:8789 ./ios/scripts/test-sync-integration.sh`，覆盖生产 Swift host、原生复制和网页协议。双平台都需完成编译检查，见 [Mac 安装](macos/README.md)。

## 网站与自部署构建

- `npm run build` / `npm run deploy`：笔记服务，根路径直接进入配对或工作区，输出 `web/dist/relay/`。不读取官网资料，不打包首页、下载或政策文件。
- `npm run build:site` / `npm run deploy:site`：官方产品网站，输出 `web/dist/site/`，使用 `wrangler.site.jsonc` 和独立的 `.deploy.site.local.json`。
- `npm run build:app-resources`：生成 App 翻译、Markdown、许可和本地隐私政策资源。
- `npm run dev` / `npm run dev:site`：分别预览笔记服务和官网；本地 Worker 分别用 `dev:api` / `dev:api:site`。

涉及路由或构建分离时，构建两种产物，并同时运行本地 Worker。`TEST_BASE_URL=http://127.0.0.1:8788 TEST_SITE_BASE_URL=http://127.0.0.1:8790 npm test` 验证笔记服务的 404 边界、官网资源及同步协议。
