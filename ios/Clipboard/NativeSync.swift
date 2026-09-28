import Foundation

/// One authenticated, encrypted link between two independently persistent devices.
/// Each endpoint can also host web sessions; links may form a connected graph.
@MainActor
final class NativeSync {
    let link: NativeLink
    private let database: NoteDatabase
    private let didChange: () -> Void
    private let status: (String) -> Void
    private var task: Task<Void, Never>?
    private var heartbeat: Task<Void, Never>?
    private var syncing: Task<Void, Never>?
    private var socket: URLSessionWebSocketTask?
    private var channel: EncryptedChannel?
    private var nonce = ""
    private var connectionID = ""
    private var checkpointID = ""
    private var pending: [String: CheckedContinuation<[String: Any], Error>] = [:]
    private var items: [String: [ReplicaChange]] = [:]
    private var timeouts: [String: Task<Void, Never>] = [:]
    private var lastMessage = Date()
    private var queued = false

    init(link: NativeLink, database: NoteDatabase, didChange: @escaping () -> Void, status: @escaping (String) -> Void) {
        self.link = link; self.database = database; self.didChange = didChange; self.status = status
    }
    func start() {
        guard task == nil else { return }
        task = Task { [weak self] in await self?.run() }
    }
    func stop() {
        task?.cancel(); task = nil; heartbeat?.cancel(); heartbeat = nil
        reset(); socket?.cancel(with: .goingAway, reason: nil); socket = nil
    }
    private func reset() {
        channel = nil; syncing?.cancel(); syncing = nil
        let waiting = pending; pending.removeAll(); items.removeAll()
        timeouts.values.forEach { $0.cancel() }; timeouts.removeAll()
        for continuation in waiting.values { continuation.resume(throwing: CancellationError()) }
    }
    private func run() async {
        guard let origin = try? APIClient.serverURL(link.server) else { return }
        let api = APIClient(server: origin, token: link.token)
        var delay = 1.0
        while !Task.isCancelled {
            if link.expiresAt <= Date().timeIntervalSince1970 * 1000 { status("设备配对已失效，请重新配对"); return }
            status("等待另一台设备上线")
            let ws = api.websocket(); socket = ws; ws.maximumMessageSize = EncryptedChannel.maximumFrame; ws.resume()
            lastMessage = Date()
            heartbeat = Task { [weak self] in
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(10)) } catch { return }
                    guard let self, self.socket === ws else { return }
                    if Date().timeIntervalSince(self.lastMessage) > 30 { ws.cancel(with: .goingAway, reason: nil) }
                    else { try? await ws.send(.string("ping")); if self.channel == nil && !self.connectionID.isEmpty { try? await self.hello(ws) } }
                    self.wake()
                }
            }
            do {
                while !Task.isCancelled {
                    let message = try await ws.receive()
                    guard socket === ws, !Task.isCancelled else { return }
                    lastMessage = Date()
                    let data: Data
                    switch message {
                    case .string(let text): if text == "pong" { continue }; data = Data(text.utf8)
                    case .data(let bytes): data = bytes
                    @unknown default: continue
                    }
                    guard let control = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw EncryptedChannel.failure() }
                    let type = control["type"] as? String
                    if type == "revoked" { status("设备配对已失效，请重新配对"); stop(); return }
                    if type == "ready" {
                        guard control["protocolVersion"] as? Int == 3, let id = control["connectionId"] as? String, UUID(uuidString: id) != nil else { throw EncryptedChannel.failure() }
                        connectionID = id
                        if control["phoneOnline"] as? Bool == true { try await hello(ws) }
                    } else if type == "presence" {
                        reset(); status("等待另一台设备上线")
                        if control["phoneOnline"] as? Bool == true { try await hello(ws) }
                    } else {
                        let frame = try JSONDecoder().decode(EncryptedEnvelope.self, from: data)
                        guard frame.clientNonce == nonce else { continue }
                        if frame.type == "welcome", channel == nil {
                            guard let phoneNonce = frame.phoneNonce else { throw EncryptedChannel.failure() }
                            let next = try EncryptedChannel(secret: link.secret, context: EncryptionContext(origin: link.server, deviceId: link.deviceId, peerId: link.peerId, connectionId: connectionID, clientNonce: nonce, phoneNonce: phoneNonce), browser: true)
                            let ready = try JSONSerialization.jsonObject(with: next.open(frame)) as? [String: Any]
                            guard ready?["type"] as? String == "secure-ready", ready?["replicaVersion"] as? Int == 1 else {
                                status("请更新另一台设备以支持多设备同步"); stop(); return
                            }
                            guard let replicaID = ready?["replicaID"] as? String, UUID(uuidString: replicaID) != nil else { throw EncryptedChannel.failure() }
                            // A reinstalled peer can retain its Keychain identity while its database starts over.
                            // Reset both cursors for the new database so surviving replicas can restore it.
                            checkpointID = link.id + "|" + replicaID
                            channel = next; delay = 1; wake()
                        } else if frame.type == "sealed", let channel {
                            guard let value = try JSONSerialization.jsonObject(with: channel.open(frame)) as? [String: Any] else { throw EncryptedChannel.failure() }
                            if value["type"] as? String == "changed" { wake(); continue }
                            guard let id = value["requestId"] as? String, let continuation = pending[id] else { continue }
                            if value["kind"] as? String == "replica-item", let raw = value["change"] {
                                let change = try JSONDecoder().decode(ReplicaChange.self, from: JSONSerialization.data(withJSONObject: raw))
                                guard items[id, default: []].count < 10 else { throw EncryptedChannel.failure() }
                                items[id, default: []].append(change); continue
                            }
                            pending.removeValue(forKey: id); timeouts.removeValue(forKey: id)?.cancel()
                            var reply = value; reply["items"] = items.removeValue(forKey: id) ?? []
                            if let error = value["error"] as? String { continuation.resume(throwing: ServiceError(status: 0, message: error)) }
                            else { continuation.resume(returning: reply) }
                        }
                    }
                }
            } catch {
                if Task.isCancelled { return }
                status("设备连接中断 · 笔记已存本机")
            }
            heartbeat?.cancel(); reset(); connectionID = ""
            ws.cancel(with: .goingAway, reason: nil)
            // Authentication failures do not erase local notes or retry indefinitely.
            do { _ = try await api.send("/session") }
            catch let error as ServiceError where error.status == 401 { status("设备配对已失效，请重新配对"); return }
            catch {}
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            delay = min(delay * 2, 15)
        }
    }
    private func hello(_ ws: URLSessionWebSocketTask) async throws {
        reset(); nonce = EncryptedChannel.randomHex()
        let value = EncryptedEnvelope(type: "hello", v: 1, clientNonce: nonce)
        try await ws.send(.string(String(decoding: JSONEncoder().encode(value), as: UTF8.self)))
    }
    private func request(_ action: String, body: [String: Any] = [:]) async throws -> [String: Any] {
        guard let socket, let channel, !Task.isCancelled else { throw CancellationError() }
        let id = UUID().uuidString.lowercased()
        var payload = body; payload["type"] = "request"; payload["requestId"] = id; payload["action"] = action
        let frame = try channel.seal(JSONSerialization.data(withJSONObject: payload))
        let encoded = String(decoding: try JSONEncoder().encode(frame), as: UTF8.self)
        let result: [String: Any] = try await withCheckedThrowingContinuation { continuation in
            pending[id] = continuation
            timeouts[id] = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
                guard let self else { return }
                self.pending.removeValue(forKey: id)?.resume(throwing: ServiceError(status: 0, message: "设备暂未响应"))
                self.items.removeValue(forKey: id); self.timeouts.removeValue(forKey: id)
                socket.cancel(with: .goingAway, reason: nil)
            }
            Task {
                guard self.socket === socket, self.channel === channel else { return }
                do { try await socket.send(.string(encoded)) }
                catch { socket.cancel(with: .goingAway, reason: nil) }
            }
        }
        try Task.checkCancellation()
        guard self.socket === socket, self.channel === channel else { throw CancellationError() }
        return result
    }
    func wake() {
        guard channel != nil else { return }
        if syncing != nil { queued = true; return }
        syncing = Task { [weak self] in
            guard let self else { return }
            let expectedChannel = self.channel
            do {
                repeat {
                    self.queued = false; self.status("正在同步设备笔记")
                    try await self.synchronize()
                } while self.queued && !Task.isCancelled
                if !Task.isCancelled { self.status("设备笔记已同步") }
            } catch {
                if !Task.isCancelled { self.status("同步中断 · 将自动重试"); self.socket?.cancel(with: .goingAway, reason: nil) }
            }
            if self.channel === expectedChannel { self.syncing = nil }
        }
    }
    private func synchronize() async throws {
        let checkpoint = checkpointID
        var cursor = try database.cursors(checkpoint)
        // Bound work per cycle. Every page/record is committed before its checkpoint.
        var more = true
        while more {
            try Task.checkCancellation()
            let response = try await request("replica-list", body: ["after": cursor.pulled])
            guard response["kind"] as? String == "replica-page", let next = response["cursor"] as? Int,
                  next >= cursor.pulled, let hasMore = response["hasMore"] as? Bool else { throw EncryptedChannel.failure() }
            let records = response["items"] as? [ReplicaChange] ?? []
            var sequence = cursor.pulled
            for change in records {
                guard change.sequence > sequence, change.sequence <= next else { throw EncryptedChannel.failure() }
                sequence = change.sequence
                if try database.merge(change.record) { didChange() }
            }
            guard next == sequence, !hasMore || next > cursor.pulled else { throw EncryptedChannel.failure() }
            cursor.pulled = next
            try database.checkpoint(checkpoint, pushed: cursor.pushed, pulled: cursor.pulled)
            more = hasMore
            try await Task.sleep(for: .milliseconds(40))
        }
        more = true
        while more {
            try Task.checkCancellation()
            let page = try database.changes(after: cursor.pushed)
            for change in page.items {
                let body = try JSONSerialization.jsonObject(with: JSONEncoder().encode(change.record))
                let result = try await request("replica-merge", body: ["record": body])
                guard result["kind"] as? String == "replica-merged" else { throw EncryptedChannel.failure() }
                cursor.pushed = change.sequence
                try database.checkpoint(checkpoint, pushed: cursor.pushed, pulled: cursor.pulled)
                try await Task.sleep(for: .milliseconds(40))
            }
            more = page.hasMore
        }
    }
}
