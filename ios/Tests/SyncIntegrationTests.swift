import Foundation

@main struct SyncIntegrationTests {
    @MainActor static func main() async throws {
        let server = try APIClient.serverURL(ProcessInfo.processInfo.environment["TEST_BASE_URL"] ?? "http://127.0.0.1:8789")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        func identity() async throws -> DeviceIdentity {
            let value = DeviceIdentity(server: server.absoluteString, deviceId: UUID().uuidString.lowercased(), secret: EncryptedChannel.randomHex())
            _ = try await APIClient(server: server).send("/register", method: "POST", body: JSONSerialization.data(withJSONObject: ["deviceId": value.deviceId, "secret": value.secret]))
            return value
        }
        func pair(_ owner: DeviceIdentity, native: Bool = true) async throws -> (NativeLink, PairedSecret) {
            struct Pair: Decodable { let code: String; let secret: String }
            struct Approval: Decodable { let peerId: String; let expiresAt: Double; let kind: String }
            let api = APIClient(server: server, token: owner.token)
            let created = try await api.decode(Pair.self, path: "/pair", method: "POST", body: JSONSerialization.data(withJSONObject: ["e2eeVersion": 1, "clientType": native ? "native" : "web"]))
            let approval = try await api.decode(Approval.self, path: "/pair/approve", method: "POST", body: JSONSerialization.data(withJSONObject: ["e2eeVersion": 1, "code": created.code]))
            let key = EncryptedChannel.randomHex()
            let link = NativeLink(server: owner.server, deviceId: owner.deviceId, peerId: approval.peerId, token: "\(owner.deviceId).\(approval.peerId).\(created.secret)", secret: key, expiresAt: approval.expiresAt)
            if native {
                struct Status: Decodable { let approved: Bool; let token: String }
                let status = try await api.decode(Status.self, path: "/pair/status", method: "POST", body: JSONSerialization.data(withJSONObject: ["code": created.code, "secret": created.secret]))
                precondition(status.approved && status.token == link.token)
            }
            return (link, PairedSecret(kind: approval.kind, server: owner.server, deviceId: owner.deviceId, peerId: approval.peerId, secret: key, expiresAt: approval.expiresAt))
        }
        func waitFor(_ label: String, _ predicate: () throws -> Bool) async throws {
            for _ in 0..<250 {
                if try predicate() { return }
                try await Task.sleep(for: .milliseconds(100))
            }
            fatalError("Timed out: \(label)")
        }
        let macID = try await identity(), iosID = try await identity(), secondID = try await identity()
        let (firstLink, firstKey) = try await pair(macID), (secondLink, secondKey) = try await pair(macID)
        let (webLink, webKey) = try await pair(secondID, native: false)
        let (directLink, directKey) = try await pair(secondID)
        let macDB = try NoteDatabase(url: root.appendingPathComponent("mac.sqlite"))
        let iosDB = try NoteDatabase(url: root.appendingPathComponent("ios.sqlite"))
        let secondDB = try NoteDatabase(url: root.appendingPathComponent("ios2.sqlite"))
        var mac = ClipboardStore(testDatabase: macDB, identity: macID, secrets: [firstKey, secondKey])
        let ios = ClipboardStore(testDatabase: iosDB, identity: iosID, secrets: [])
        let second = ClipboardStore(testDatabase: secondDB, identity: secondID, secrets: [webKey, directKey])
        let first = NativeSync(link: firstLink, database: iosDB, didChange: {}, status: { print("iOS: \($0)") })
        let secondSync = NativeSync(link: secondLink, database: secondDB, didChange: { Task { await second.changed(id: UUID().uuidString.lowercased()) } }, status: { print("iOS2: \($0)") })
        let directSync = NativeSync(link: directLink, database: iosDB, didChange: {}, status: { _ in })
        defer { directSync.stop(); first.stop(); secondSync.stop(); mac.suspendForTesting(); ios.suspendForTesting(); second.suspendForTesting() }
        mac.setActive(true); ios.setActive(true); second.setActive(true)
        let a = UUID().uuidString.lowercased(), b = UUID().uuidString.lowercased()
        try mac.save(id: a, text: "Mac initial", revision: 0)
        try ios.save(id: b, text: "iPhone initial", revision: 0)
        for i in 0..<24 { try mac.save(id: UUID().uuidString.lowercased(), text: "Paged note \(i)", revision: 0) }
        first.start(); secondSync.start()
        try await waitFor("initial bidirectional merge") { try iosDB.page(limit: 100).items.count == 26 && macDB.note(b) != nil && secondDB.page(limit: 100).items.count == 26 }
        // A browser uses the existing protocol against the second iPhone, then all native replicas converge.
        let web = APIClient(server: server, token: webLink.token).websocket(); web.maximumMessageSize = EncryptedChannel.maximumFrame; web.resume()
        defer { web.cancel(with: .goingAway, reason: nil) }
        func receive() async throws -> Data {
            while true {
                let message = try await web.receive()
                if case .string(let value) = message { if value == "pong" { continue }; return Data(value.utf8) }
                if case .data(let data) = message { return data }
            }
        }
        let ready = try JSONSerialization.jsonObject(with: await receive()) as! [String: Any]
        let nonce = EncryptedChannel.randomHex()
        try await web.send(.string(String(decoding: JSONEncoder().encode(EncryptedEnvelope(type: "hello", v: 1, clientNonce: nonce)), as: UTF8.self)))
        let welcome = try JSONDecoder().decode(EncryptedEnvelope.self, from: await receive())
        let channel = try EncryptedChannel(secret: webLink.secret, context: EncryptionContext(origin: server.absoluteString, deviceId: secondID.deviceId, peerId: webLink.peerId, connectionId: ready["connectionId"] as! String, clientNonce: nonce, phoneNonce: welcome.phoneNonce!), browser: true)
        _ = try channel.open(welcome)
        func webRequest(_ action: String, _ body: [String: Any]) async throws -> [String: Any] {
            let requestID = UUID().uuidString.lowercased()
            var payload = body; payload["type"] = "request"; payload["requestId"] = requestID; payload["action"] = action
            let frame = try channel.seal(JSONSerialization.data(withJSONObject: payload))
            try await web.send(.string(String(decoding: JSONEncoder().encode(frame), as: UTF8.self)))
            while true {
                let frame = try JSONDecoder().decode(EncryptedEnvelope.self, from: await receive())
                let value = try JSONSerialization.jsonObject(with: channel.open(frame)) as! [String: Any]
                if value["requestId"] as? String == requestID { return value }
            }
        }
        let c = UUID().uuidString.lowercased()
        let saved = try await webRequest("save", ["id": c, "text": "Web → iOS2 → Mac → iOS1", "baseRevision": 0])
        precondition(saved["kind"] as? String == "saved")
        // Web peers may edit notes but cannot impersonate replication participants.
        let denied = try await webRequest("replica-list", ["after": 0])
        precondition(denied["error"] != nil)
        try await waitFor("web write reaches every native device") { try macDB.note(c) != nil && iosDB.note(c) != nil }
        first.stop(); secondSync.stop()
        let old = try iosDB.note(a)!
        try ios.save(id: a, text: "offline iOS edit", revision: old.revision)
        try mac.save(id: a, text: "offline Mac edit", revision: macDB.note(a)!.revision)
        try macDB.delete(id: b)
        first.start(); secondSync.start()
        try await waitFor("offline conflict and deletion converge") {
            let texts = Set(try iosDB.page(limit: 100).items.map(\.text))
            return try texts.contains("offline iOS edit") && texts.contains("offline Mac edit") && iosDB.note(b) == nil && secondDB.note(b) == nil
        }
        let bigID = UUID().uuidString.lowercased()
        try ios.save(id: bigID, text: String(repeating: "😀", count: 100_000), revision: 0); first.wake()
        try await waitFor("100k over encrypted relay") { try secondDB.note(bigID)?.text.unicodeScalars.count == 100_000 }
        let deleted = try await webRequest("delete", ["id": c, "baseRevision": secondDB.note(c)!.revision])
        precondition(deleted["kind"] as? String == "deleted")
        try await waitFor("web delete reaches every device") { try macDB.note(c) == nil && iosDB.note(c) == nil }
        // Reinstall simulation: same server identity/keys, new empty database and sequence origin.
        // Existing clients must reset their acknowledged cursors and restore the surviving copies.
        first.stop(); secondSync.stop(); mac.suspendForTesting()
        directSync.start()
        let directID = UUID().uuidString.lowercased()
        try ios.save(id: directID, text: "iOS to iOS while Mac is offline", revision: 0)
        try await waitFor("direct iOS to iOS without a Mac") { try secondDB.note(directID) != nil }
        directSync.stop()
        let restoredDB = try NoteDatabase(url: root.appendingPathComponent("mac-reinstalled.sqlite"))
        mac = ClipboardStore(testDatabase: restoredDB, identity: macID, secrets: [firstKey, secondKey])
        mac.setActive(true); first.start(); secondSync.start()
        try await waitFor("database replacement restores copies despite old checkpoints") {
            try restoredDB.note(bigID)?.text.unicodeScalars.count == 100_000 && restoredDB.record(c)?.deleted == true
        }
        _ = try await APIClient(server: server, token: macID.token).send("/peers/\(firstLink.peerId)", method: "DELETE")
        try await Task.sleep(for: .milliseconds(300))
        struct ErrorCheck: Decodable { let error: String }
        do { _ = try await APIClient(server: server, token: firstLink.token).send("/session"); fatalError("revoked session accepted") }
        catch let error as ServiceError { precondition(error.status == 401) }
        print("PASS: real Swift host + native clients + web protocol, three local databases, encrypted bidirectional sync, offline conflict/delete recovery, 100k emoji, database replacement recovery, browser authorization isolation and revocation")
    }
}
