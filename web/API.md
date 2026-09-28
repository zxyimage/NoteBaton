# Relay API v3

生产使用 HTTPS/WSS、同域请求。HTTP 错误为 `{error:string}`；正文与令牌不得记录日志。

## 配对和身份

| 路径 | 用途 |
| --- | --- |
| `GET /api/info` | 无需凭证，返回产品、协议版本、配对链接版本和数据上限 |
| `POST /api/register` | 手机 `{deviceId:UUID,secret:64位随机hex}`；设备凭证不匹配返回 409 |
| `POST /api/pair` | 网页提交 `{e2eeVersion:1}`，返回 `{code,secret,expiresAt}`；code 5 分钟有效 |
| `POST /api/pair/approve` | 手机带 owner 凭证提交 `{code,e2eeVersion:1}`，成功返回 `{ok:true,peerId,expiresAt}`；同一配对不可被另一手机占用 |
| `POST /api/pair/status` | 网页提交 `{code,secret}`，批准后设置 HttpOnly/Secure/SameSite=Strict Cookie |
| `GET /api/session` | 验证凭证，返回 `{deviceId,peerId,expiresAt,e2eeVersion:1}` |
| `GET /api/peers` | 手机获取有效网页授权 |
| `DELETE /api/peers/:id` | 手机移除授权，实时关闭相关连接 |
| `POST /api/logout` | 网页撤销自己的授权并清 Cookie |
| `GET /api/events?v=3` | WebSocket upgrade，沿用 Cookie 或 Authorization |

手机 token 为 `deviceId.owner.secret`，网页为 `deviceId.peerId.secret`。服务器只保存 secret 的 SHA-256；peer 授权 7 天有效，最多 20 个，每个最多 8 个连接。凭证不放 URL。

## 自部署与配对链接 v2

网页本地生成独立的 32 字节加密密钥，仅放入 `https://服务域名/pair#v=2&code=RLY-…&key=<64位小写hex>`，不上传 API。二维码与复制链接内容相同；不含网页 claim secret。fragment 不随 HTTP 请求发送，链接本身须保密。

手动配对字符串为 `RLY-….<key>`，需另填服务网址；旧短码被拒绝。接受 HTTPS 根网址（DEBUG 支持本机 HTTP），按 scheme/host/port 隔离身份。`/api/info` 返回 `{product:"relay-clipboard",protocolVersion:3,pairingLinkVersion:2,e2eeVersion:1,storage:"device",replicaVersion:1,maxNoteCharacters:100000,pageSize:10}`。手机先无凭证探测并确认域名，禁止跟随重定向。

App 保存多个服务配置，一次只连接一个。笔记仍是同一份本机库，各服务的身份与配对密钥分开保存。升级前的网页授权需要重新配对，本机笔记保留。

## 实时协议

笔记：`{id,text,createdAt,updatedAt,revision}`，时间单位毫秒，text 最多 100,000 个 Unicode 码点。每台原生设备各有本机副本，网页连接的设备负责确认保存。

以下均为**加密前的端点内部消息**，不得直接发送到 WebSocket。网页请求 `{type:"request",requestId:UUID,action,...参数}`：

- `list`：`cursor:null|{updatedAt,id}`，可带 `knownIds` 检查离线期间删除的记录。手机按修改时间倒序、id 升序返回 10 条。
- `save`：`{id,text,baseRevision}`。新笔记 revision 从 0 开始；手机落盘后返回最新 note。旧 revision 的不同正文拒绝覆盖；同正文重试幂等。
- `delete`：`{id,baseRevision}`。手机保存删除标识，延迟重试不得复活笔记。

路由信息仅用于选择本地密钥，会话认证成功后手机才处理请求。手机在密文内回复 `{type:"reply",requestId,...}`：

- 分页逐条发送 `{kind:"item",note}`，随后 `{kind:"page",hasMore,cursor,removedIds}`，避免 10 条大笔记挤进同一帧。
- 保存 `{kind:"saved",note}`；删除 `{kind:"deleted",id}`；失败 `{error}`。

手机变更通知 `{type:"changed",id,deleted}` 也按各连接独立加密；网页解密后刷新列表。具体 AES-GCM/HKDF、握手和密文帧定义见 [端到端加密协议](../docs/端到端加密.md)。

`ready`（含 protocolVersion:3、connectionId）、`presence`（phoneOnline）、`peer-disconnected`（connectionId）、`revoked` 仅为连接控制提示，不能作为笔记操作结果或密码学身份依据。文本 `ping` / `pong` 用于心跳。手机只有收到能正确解密的请求后才访问笔记；网页只有验证加密的 `secure-ready` 后才开始同步。

帧最多 1,100,000 字节，每个网页连接每分钟最多 240 次消息。中转剔除非白名单字段，只转发 `hello/welcome/sealed` 信封，不解析业务内容。旧明文帧关闭码 1008，不兼容连接返回 426，失效/撤销关闭码 4001。手机离线不排队，网页保留未同步草稿。

## v1 迁移桥

`POST /api/legacy/login` 使用旧账号密码创建短期迁移凭证；`GET /api/legacy/clips?before=...` 只读旧数据。App 已持久化全部旧笔记后才提交 `POST /api/legacy/finish {ids}`；服务器检查所有旧 ID 已包含才删除旧正文。确认请求可重试。旧数据的写入接口已取消。

迁移桥只保护历史云端数据导入，使用 HTTPS 而非本端到端协议；迁入手机后的新同步均加密。

## 原生设备复制扩展（3.2）

`GET /api/info` 新增 `replicaVersion:1`，`storage` 改为 `device`；WebSocket 与链接版本保持兼容。`POST /api/pair` 可指定 `clientType:"native"`（默认 web）。批准返回 `kind:"native"|"web"`；原生授权 365 天、网页 7 天。原生 `/pair/status` 返回 `{approved:true,token,deviceId,peerId,expiresAt}`，不设置 Cookie；网页仍只发 HttpOnly Cookie。配对类型创建后不可通过 claim 参数修改，撤销后的原生 claim 返回 410。

`GET /api/peers` 新增 `kind`。原生 bearer 可使用现有 session/events/logout；不能以 peer 身份批准别人或管理其他配对。服务器只增加配对类型元数据，仍不保存正文。

原生副本业务 `replica-list` / `replica-merge` 仅能通过本机授权为 native 的加密会话执行，Web 请求这类操作会被拒绝。每帧上限不变，原生每分钟最多 2400 帧。详细记录结构、游标、事务、冲突和兼容性见 [多设备同步协议](../docs/多设备同步.md)。
