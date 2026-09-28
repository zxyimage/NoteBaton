import Foundation
import Observation

@MainActor @Observable
final class ClipboardStore {
    private(set) var isActivated = UserDefaults.standard.bool(forKey: "isActivated")
    private(set) var services: [String] = []
    private(set) var connecting = false
    var suggestedPairingLink = ""
    private(set) var identity: DeviceIdentity?
    private(set) var notes: [Note] = []
    private(set) var hasMore = false
    private(set) var connection = "同步已暂停"
    private(set) var connected = false
    private(set) var peers: [Peer] = []
    private(set) var nativeLinks: [NativeLink] = []
    private(set) var deviceStatus: [String: String] = [:]
    @ObservationIgnored private var nativeSync: [String: NativeSync] = [:]
    var error: String?
    var notice: String?
    var migrating = false
    private(set) var legacyMigrated = UserDefaults.standard.bool(forKey: "legacyMigrated")
    @ObservationIgnored private var pairedSecretProvider: () throws -> [PairedSecret] = { try KeychainStore.pairedSecrets() }
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var database: NoteDatabase?
    @ObservationIgnored private var active = false
    @ObservationIgnored private var receiveTask: Task<Void, Never>?
    @ObservationIgnored private var heartbeatTask: Task<Void, Never>?
    @ObservationIgnored private var changedTasks: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var socket: URLSessionWebSocketTask?
    @ObservationIgnored private var channels: [String: (channel: EncryptedChannel, expiresAt: Double, native: Bool)] = [:]
    @ObservationIgnored private var lastMessage = Date()
    @ObservationIgnored private var clipboardChange = -1
    @ObservationIgnored private var lastClipboardHash = UserDefaults.standard.string(forKey: "lastClipboardHash")

    #if SYNC_TESTING
    init(testDatabase: NoteDatabase, identity: DeviceIdentity, secrets: [PairedSecret]) {
        self.database = testDatabase; self.identity = identity; self.services = [identity.server]
        self.pairedSecretProvider = { secrets }; self.isActivated = false
        try? reload()
    }
    func suspendForTesting() { active = false; stop() }
    #endif
    init() {
        do {
            var all = try KeychainStore.identities()
            if all.isEmpty, let old = KeychainStore.load() {
                all = [try KeychainStore.identity(server: old.server)]
            }
            nativeLinks = try KeychainStore.nativeLinks()
            services = all.map(\.server).sorted()
            let defaults = UserDefaults.standard
            if defaults.bool(forKey: "serviceSelectionSaved") {
                identity = all.first { $0.server == defaults.string(forKey: "activeService") }
            } else {
                identity = all.first
                // Remember an explicit local-only selection too. A failed first
                // pairing may create a credential but must not activate it on restart.
                defaults.set(true, forKey: "serviceSelectionSaved")
                defaults.set(identity?.server, forKey: "activeService")
            }
            if identity != nil { isActivated = true; defaults.set(true, forKey: "isActivated") }
        } catch { self.error = error.localizedDescription }
        do { database = try NoteDatabase(); try reload() } catch { self.error = error.localizedDescription }
        if identity == nil { connection = "本机模式 · 尚未连接服务" }
    }
    private var client: APIClient? {
        guard let identity, let server = try? APIClient.serverURL(identity.server) else { return nil }
        return APIClient(server: server, token: identity.token)
    }
    func activate() {
        guard database != nil else { error = "本地存储暂不可用，请重启 App 后重试"; return }
        isActivated = true; UserDefaults.standard.set(true, forKey: "isActivated")
        start(); importClipboard()
    }
    func setActive(_ value: Bool) {
        #if os(macOS)
        // Keep network replication running while the Mac window is inactive.
        if !value { return }
        #endif
        let entering = value && !active
        active = value
        if value {
            start()
            if entering, isActivated, KeychainStore.load() == nil { importClipboard() }
        } else { stop(); connection = identity == nil ? "本机模式" : "iPhone 在前台时同步" }
    }
    private func select(_ newIdentity: DeviceIdentity?) {
        stop(); identity = newIdentity; peers = []
        UserDefaults.standard.set(true, forKey: "serviceSelectionSaved")
        UserDefaults.standard.set(newIdentity?.server, forKey: "activeService")
        connection = newIdentity == nil ? "本机模式 · 尚未连接服务" : "正在连接"
        start()
    }
    func disconnect() { guard !connecting, !migrating else { return }; select(nil) }
    /// The UI must show and confirm target.server before calling this method.
    func connect(_ target: PairingTarget) async -> Bool {
        guard !connecting, !migrating else { return false }
        connecting = true; defer { connecting = false }
        do {
            let probe = APIClient(server: target.server)
            try await probe.verifyService()
            try Task.checkCancellation()
            let next = try KeychainStore.identity(server: target.server.absoluteString)
            services = try KeychainStore.identities().map(\.server).sorted()
            let api = APIClient(server: target.server, token: next.token)
            let body = try JSONSerialization.data(withJSONObject: ["deviceId": next.deviceId, "secret": next.secret])
            _ = try await api.send("/register", method: "POST", body: body)
            if let code = target.code {
                guard let secret = target.encryptionKey else { throw EncryptedChannel.failure() }
                struct Approval: Decodable { let peerId: String; let expiresAt: Double; let kind: String? }
                let approved = try await api.decode(Approval.self, path: "/pair/approve", method: "POST", body: JSONSerialization.data(withJSONObject: ["code": code, "e2eeVersion": 1]))
                guard UUID(uuidString: approved.peerId) != nil, approved.expiresAt > Date().timeIntervalSince1970 * 1000 else { throw EncryptedChannel.failure() }
                let expiry = min(approved.expiresAt, Date().timeIntervalSince1970 * 1000 + (approved.kind == "native" ? 365 : 7) * 86400_000)
                try KeychainStore.savePairSecret(PairedSecret(kind: approved.kind, server: next.server, deviceId: next.deviceId, peerId: approved.peerId, secret: secret, expiresAt: expiry))
            }
            try Task.checkCancellation()
            select(next)
            if target.code != nil { suggestedPairingLink = "" }
            notice = target.code == nil ? "已切换同步服务" : "设备或网页已配对"
            await loadPeers(); return true
        } catch is CancellationError { return false }
        catch { self.error = error.localizedDescription; return false }
    }
    func reload() throws {
        guard let database else { return }
        let page = try database.page(limit: max(notes.count, 50)); notes = page.items; hasMore = page.hasMore
    }
    func loadMore() { do { guard let database else { return }; let page = try database.page(limit: notes.count + 50); notes = page.items; hasMore = page.hasMore } catch { self.error = error.localizedDescription } }
    func note(_ id: String) -> Note? { try? database?.note(id) }
    @discardableResult func save(id: String, text: String, revision: Int) throws -> Note {
        guard let database else { throw ServiceError(status: 0, message: "本地存储暂不可用，输入已保留") }
        let result = try database.save(id: id, text: text, baseRevision: revision)
        notes.removeAll { $0.id == id }; notes.insert(result, at: 0)
        notes.sort { $0.updatedAt == $1.updatedAt ? $0.id < $1.id : $0.updatedAt > $1.updatedAt }
        changedTasks[id]?.cancel()
        changedTasks[id] = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(350)) } catch { return }
            await self?.changed(id: id)
            self?.changedTasks.removeValue(forKey: id)
        }
        return result
    }
    func delete(_ note: Note) {
        do {
            try database?.delete(id: note.id, baseRevision: note.revision)
            notes.removeAll { $0.id == note.id }
            changedTasks[note.id]?.cancel(); changedTasks.removeValue(forKey: note.id)
            Task { await changed(id: note.id, deleted: true) }
        } catch { self.error = error.localizedDescription }
    }
    private func rememberClipboard(_ hash: String) { lastClipboardHash = hash; UserDefaults.standard.set(hash, forKey: "lastClipboardHash") }
    func copy(_ text: String) { DeviceClipboard.string = text; clipboardChange = DeviceClipboard.changeCount; rememberClipboard(NoteDatabase.hash(text)); notice = "已复制" }
    func importClipboard() {
        guard isActivated, let database, active else { return }
        guard DeviceClipboard.changeCount != clipboardChange, DeviceClipboard.hasStrings else { return }
        // Mark the attempt before iOS presents its permission dialog. Denial
        // must not start a prompt loop when the scene becomes active again.
        clipboardChange = DeviceClipboard.changeCount
        // iOS controls paste permission. A denied read is never treated as empty data.
        guard let text = DeviceClipboard.string else { return }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { clipboardChange = DeviceClipboard.changeCount; return }
        guard text.unicodeScalars.count <= 100_000 else { notice = "剪贴板超过 100,000 个字符，未自动导入"; clipboardChange = DeviceClipboard.changeCount; return }
        let hash = NoteDatabase.hash(text)
        if hash == lastClipboardHash { clipboardChange = DeviceClipboard.changeCount; return }
        if PairingTarget.isPairingInput(text) {
            suggestedPairingLink = text; rememberClipboard(hash)
            notice = "发现配对链接，请到「配对与同步」确认网址"
            return
        }
        do {
            if try !database.contains(text: text) {
                try save(id: UUID().uuidString.lowercased(), text: text, revision: 0)
                notice = "剪贴板已保存到本机"
            }
            clipboardChange = DeviceClipboard.changeCount; rememberClipboard(hash)
        } catch { self.error = error.localizedDescription }
    }
    private func stop() {
        nativeSync.values.forEach { $0.stop() }; nativeSync.removeAll(); deviceStatus.removeAll()
        generation += 1; channels.removeAll()
        receiveTask?.cancel(); receiveTask = nil; heartbeatTask?.cancel(); heartbeatTask = nil
        socket?.cancel(with: .goingAway, reason: nil); socket = nil; connected = false
    }
    private func start() {
        guard active, let identity, let client, receiveTask == nil else { return }
        startDeviceLinks()
        connection = "正在连接"
        let run = generation
        receiveTask = Task { [weak self] in
            guard let self else { return }
            #if !SYNC_TESTING
            await self.migrateLegacy()
            #endif
            guard !Task.isCancelled, self.active, self.generation == run else { return }
            self.importClipboard()
            var delay = 1.0
            while !Task.isCancelled, self.active, self.generation == run {
                do {
                    try await client.verifyService()
                    self.channels.removeAll()
                    let body = try JSONSerialization.data(withJSONObject: ["deviceId": identity.deviceId, "secret": identity.secret])
                    _ = try await client.send("/register", method: "POST", body: body)
                    guard !Task.isCancelled, self.active, self.generation == run else { return }
                    let ws = client.websocket(); ws.maximumMessageSize = EncryptedChannel.maximumFrame; self.socket = ws; ws.resume()
                    self.lastMessage = Date()
                    while !Task.isCancelled, self.active, self.generation == run {
                        let message = try await ws.receive()
                        guard !Task.isCancelled, self.socket === ws else { break }
                        self.lastMessage = Date()
                        let data: Data
                        switch message { case .string(let value): if value == "pong" { continue }; data = Data(value.utf8)
                        case .data(let value): data = value
                        @unknown default: continue }
                        let frame = try JSONDecoder().decode(EncryptedEnvelope.self, from: data)
                        if frame.type == "ready" { self.connected = true; self.connection = "端到端加密 · 已连接"; delay = 1 }
                        else { await self.receiveEncrypted(frame, identity: identity, ws: ws) }
                    }
                } catch {
                    if Task.isCancelled || self.generation != run { return }
                    self.connection = "等待兼容服务或网络 · 笔记已存本机"; self.connected = false; self.channels.removeAll()
                }
                self.socket?.cancel(with: .goingAway, reason: nil)
                do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                delay = min(delay * 2, 15)
            }
        }
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(10)) } catch { return }
                guard let self, self.active, self.generation == run else { return }
                if Date().timeIntervalSince(self.lastMessage) > 30 { self.socket?.cancel(with: .goingAway, reason: nil) }
                else { try? await self.socket?.send(.string("ping")) }
            }
        }
    }
    private func sendEncrypted(_ value: [String: Any], channel: EncryptedChannel, ws: URLSessionWebSocketTask, type: String = "sealed") async throws {
        guard channels[channel.context.connectionId]?.channel === channel,
              let expiry = channels[channel.context.connectionId]?.expiresAt, expiry > Date().timeIntervalSince1970 * 1000 else { throw EncryptedChannel.failure() }
        let envelope = try channel.seal(JSONSerialization.data(withJSONObject: value), type: type)
        guard socket === ws, !Task.isCancelled else { throw CancellationError() }
        try await ws.send(.string(String(decoding: JSONEncoder().encode(envelope), as: UTF8.self)))
    }
    private func receiveEncrypted(_ frame: EncryptedEnvelope, identity: DeviceIdentity, ws: URLSessionWebSocketTask) async {
        guard socket === ws, let connectionId = frame.connectionId, UUID(uuidString: connectionId) != nil else { return }
        if frame.type == "peer-disconnected" { channels.removeValue(forKey: connectionId); return }
        guard let peerId = frame.peerId, UUID(uuidString: peerId) != nil else { return }
        do {
            if frame.type == "hello" {
                guard frame.v == 1, let clientNonce = frame.clientNonce, PairingTarget.validKey(clientNonce),
                      let key = try pairedSecretProvider().first(where: { $0.server == identity.server && $0.deviceId == identity.deviceId && $0.peerId == peerId }) else { return }
                channels = channels.filter { $0.value.expiresAt > Date().timeIntervalSince1970 * 1000 }
                guard channels[connectionId] != nil || channels.count < 160 else { return }
                let context = EncryptionContext(origin: identity.server, deviceId: identity.deviceId, peerId: peerId,
                                                connectionId: connectionId, clientNonce: clientNonce, phoneNonce: EncryptedChannel.randomHex())
                let channel = try EncryptedChannel(secret: key.secret, context: context)
                channels[connectionId] = (channel, key.expiresAt, key.kind == "native")
                try await sendEncrypted(["type": "secure-ready", "replicaVersion": 1, "replicaID": database?.replicaID ?? ""], channel: channel, ws: ws, type: "welcome")
                return
            }
            guard frame.type == "sealed", let entry = channels[connectionId], entry.channel.context.peerId == peerId,
                  entry.expiresAt > Date().timeIntervalSince1970 * 1000 else { return }
            let data = try entry.channel.open(frame)
            let request = try JSONDecoder().decode(RelayRequest.self, from: data)
            guard request.type == "request" else { throw EncryptedChannel.failure() }
            await handle(request, channel: entry.channel, ws: ws)
        } catch {
            channels.removeValue(forKey: connectionId)
            self.error = "网页加密验证失败，已停止该连接；请重新连接或配对"
        }
    }
    func changed(id: String, deleted: Bool = false) async {
        nativeSync.values.forEach { $0.wake() }
        guard connected, let socket else { return }
        for entry in Array(channels.values) {
            try? await sendEncrypted(["type": "changed", "id": id, "deleted": deleted], channel: entry.channel, ws: socket)
        }
    }
    private func object<T: Encodable>(_ value: T) throws -> Any { try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) }
    private func handle(_ request: RelayRequest, channel: EncryptedChannel, ws: URLSessionWebSocketTask) async {
        guard socket === ws, !Task.isCancelled, let requestId = request.requestId, UUID(uuidString: requestId) != nil, let database else { return }
        var reply: [String: Any] = ["type": "reply", "requestId": requestId]
        do {
            if let revision = request.baseRevision, revision < 0 { throw ServiceError(status: 400, message: "笔记版本不正确") }
            if let id = request.id, UUID(uuidString: id) == nil { throw ServiceError(status: 400, message: "笔记标识不正确") }
            if let cursor = request.cursor, (!cursor.updatedAt.isFinite || UUID(uuidString: cursor.id) == nil) { throw ServiceError(status: 400, message: "分页格式不正确") }
            if let known = request.knownIds, (known.count > 2000 || known.contains(where: { UUID(uuidString: $0) == nil })) { throw ServiceError(status: 400, message: "分页格式不正确") }
            switch request.action {
            case "replica-list":
                guard channels[channel.context.connectionId]?.native == true, let after = request.after, after >= 0 else { throw ServiceError(status: 403, message: "此配对不支持设备同步") }
                let page = try database.changes(after: after)
                for change in page.items {
                    var item = reply; item["kind"] = "replica-item"; item["change"] = try object(change)
                    try await sendEncrypted(item, channel: channel, ws: ws)
                }
                reply["kind"] = "replica-page"; reply["cursor"] = page.cursor; reply["hasMore"] = page.hasMore
            case "replica-merge":
                guard channels[channel.context.connectionId]?.native == true, let record = request.record else { throw ServiceError(status: 403, message: "此配对不支持设备同步") }
                if try database.merge(record) { try reload(); await changed(id: record.id, deleted: record.deleted) }
                reply["kind"] = "replica-merged"
            case "list":
                let page = try database.page(after: request.cursor)
                for note in page.items { var item = reply; item["kind"] = "item"; item["note"] = try object(note); try await sendEncrypted(item, channel: channel, ws: ws) }
                reply["kind"] = "page"; reply["hasMore"] = page.hasMore; reply["cursor"] = try page.cursor.map { try object($0) } ?? NSNull()
                reply["removedIds"] = try (request.knownIds ?? []).prefix(2000).filter { try database.note($0) == nil }
            case "save":
                guard let id = request.id, let text = request.text, let revision = request.baseRevision else { throw ServiceError(status: 400, message: "笔记格式不正确") }
                let note = try save(id: id, text: text, revision: revision)
                reply["kind"] = "saved"; reply["note"] = try object(note)
            case "delete":
                guard let id = request.id, let revision = request.baseRevision else { throw ServiceError(status: 400, message: "笔记格式不正确") }
                try database.delete(id: id, baseRevision: revision); notes.removeAll { $0.id == id }
                reply["kind"] = "deleted"; reply["id"] = id
                await changed(id: id, deleted: true)
            default: throw ServiceError(status: 400, message: "未知操作")
            }
            try await sendEncrypted(reply, channel: channel, ws: ws)
        } catch { reply["error"] = error.localizedDescription; try? await sendEncrypted(reply, channel: channel, ws: ws) }
    }
    private func startDeviceLinks() {
        guard let database, let identity else { return }
        for link in nativeLinks where link.server == identity.server && nativeSync[link.id] == nil {
            let sync = NativeSync(link: link, database: database, didChange: { [weak self] in
                guard let self else { return }
                do { try self.reload() } catch { self.error = error.localizedDescription }
                // Wake all links and browsers after incoming replication, including conflict copies.
                Task { await self.changed(id: UUID().uuidString.lowercased()) }
            }, status: { [weak self] status in self?.deviceStatus[link.id] = status })
            nativeSync[link.id] = sync; sync.start()
        }
    }
    func createInvitation() async throws -> DeviceInvitation {
        guard let client else { throw ServiceError(status: 0, message: "请先连接同步服务") }
        try await client.verifyService(requireReplication: true)
        struct Invitation: Decodable { let code: String; let secret: String; let expiresAt: Double }
        let result = try await client.decode(Invitation.self, path: "/pair", method: "POST", body: JSONSerialization.data(withJSONObject: ["e2eeVersion": 1, "clientType": "native"]))
        return DeviceInvitation(server: client.server, code: result.code, claimSecret: result.secret, encryptionKey: EncryptedChannel.randomHex(), expiresAt: result.expiresAt)
    }
    func claimInvitation(_ invitation: DeviceInvitation) async throws -> Bool {
        struct Status: Decodable { let approved: Bool; let token: String?; let deviceId: String?; let peerId: String?; let expiresAt: Double? }
        let api = APIClient(server: invitation.server)
        let result = try await api.decode(Status.self, path: "/pair/status", method: "POST", body: JSONSerialization.data(withJSONObject: ["code": invitation.code, "secret": invitation.claimSecret]))
        guard result.approved else { return false }
        guard let token = result.token, let deviceID = result.deviceId, let peerID = result.peerId, let expiry = result.expiresAt,
              UUID(uuidString: deviceID) != nil, UUID(uuidString: peerID) != nil, token == "\(deviceID).\(peerID).\(invitation.claimSecret)", expiry > Date().timeIntervalSince1970 * 1000 else { throw EncryptedChannel.failure() }
        if try KeychainStore.identities().contains(where: { $0.server == invitation.server.absoluteString && $0.deviceId == deviceID }) {
            throw ServiceError(status: 400, message: "请用另一台设备确认配对")
        }
        let link = NativeLink(server: invitation.server.absoluteString, deviceId: deviceID, peerId: peerID, token: token, secret: invitation.encryptionKey, expiresAt: min(expiry, Date().timeIntervalSince1970 * 1000 + 365 * 86400_000))
        var links = try KeychainStore.nativeLinks(); links.removeAll { $0.id == link.id }; links.append(link)
        try KeychainStore.saveNativeLinks(links); nativeLinks = links
        startDeviceLinks(); notice = "设备已配对，正在合并笔记"; return true
    }
    func removeLink(_ link: NativeLink) async {
        do {
            let links = try KeychainStore.nativeLinks().filter { $0.id != link.id }
            try KeychainStore.saveNativeLinks(links)
            nativeSync.removeValue(forKey: link.id)?.stop(); deviceStatus.removeValue(forKey: link.id); nativeLinks = links
            let api = APIClient(server: try APIClient.serverURL(link.server), token: link.token)
            _ = try await api.send("/logout", method: "POST")
        } catch { self.error = error.localizedDescription }
    }
    func loadPeers() async {
        guard let client else { return }; let token = identity?.token
        do {
            let result = try await client.decode(PeerList.self, path: "/peers").peers
            if identity?.token == token { peers = result }
        } catch { if identity?.token == token { self.error = error.localizedDescription } }
    }
    func revoke(_ peer: Peer) async {
        guard let client, !connecting else { return }; let token = identity?.token
        do {
            if let identity {
                try KeychainStore.removePairSecret(server: identity.server, deviceId: identity.deviceId, peerId: peer.id)
                channels = channels.filter { $0.value.channel.context.peerId != peer.id }
            }
            _ = try await client.send("/peers/\(peer.id)", method: "DELETE")
            if identity?.token == token { await loadPeers() }
        }
        catch { if identity?.token == token { self.error = error.localizedDescription } }
    }
    func importLegacy(username: String, password: String) async -> Bool {
        guard let client, let identity, !connecting, !migrating else { return false }
        do {
            struct Login: Decodable { let token: String }
            let body = try JSONSerialization.data(withJSONObject: ["username": username, "password": password])
            let login = try await client.decode(Login.self, path: "/legacy/login", method: "POST", body: body)
            try KeychainStore.save(StoredSession(server: identity.server, token: login.token, username: username, expiresAt: Date().timeIntervalSince1970 * 1000 + 600_000))
            await migrateLegacy()
            if legacyMigrated, let note = notes.first { await changed(id: note.id) }
            return legacyMigrated
        } catch { self.error = error.localizedDescription; return false }
    }
    private func migrateLegacy() async {
        guard let old = KeychainStore.load(), let database else { return }
        migrating = true; defer { migrating = false }
        do {
            let api = APIClient(server: try APIClient.serverURL(old.server), token: old.token)
            var cursor: Int?; var ids: [String] = []
            repeat {
                let path = "/legacy/clips" + (cursor.map { "?before=\($0)" } ?? "")
                let page = try await api.decode(ClipPage.self, path: path)
                for clip in page.items { try database.importLegacy(clip); ids.append(clip.id) }
                cursor = page.nextCursor
            } while cursor != nil
            try reload()
            // Purge only after each imported row was committed and read back locally.
            let body = try JSONSerialization.data(withJSONObject: ["ids": ids])
            _ = try await api.send("/legacy/finish", method: "POST", body: body)
            KeychainStore.clear()
            legacyMigrated = true; UserDefaults.standard.set(true, forKey: "legacyMigrated")
            notice = "旧笔记已迁移到手机，云端副本已清除"
        } catch { self.error = "旧笔记迁移未完成，云端未主动清除。\(error.localizedDescription)" }
    }
}
