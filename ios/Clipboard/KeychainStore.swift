import Foundation
import Security

enum KeychainStore {
    private static let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "app.privateclipboard.relay",
        kSecAttrAccount as String: "session"
    ]
    static func load() -> StoredSession? {
        var attributes = query
        attributes[kSecReturnData as String] = true
        attributes[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(attributes as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(StoredSession.self, from: data)
    }
    static func save(_ session: StoredSession) throws {
        let data = try JSONEncoder().encode(session)
        let updates: [String: Any] = [kSecValueData as String: data]
        var status = SecItemUpdate(query as CFDictionary, updates as CFDictionary)
        if status == errSecItemNotFound {
            var attributes = query
            attributes[kSecValueData as String] = data
            attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(attributes as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw ServiceError(status: 0, message: "无法安全保存登录信息，请重试") }
    }
    static func clear() { SecItemDelete(query as CFDictionary) }
    private static var identityQuery: [String: Any] {
        var value = query; value[kSecAttrAccount as String] = "device-identity-v2"; return value
    }
    static func loadIdentity() -> DeviceIdentity? {
        var attributes = identityQuery
        attributes[kSecReturnData as String] = true; attributes[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(attributes as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(DeviceIdentity.self, from: data)
    }
    private static var identitiesQuery: [String: Any] {
        var value = query; value[kSecAttrAccount as String] = "device-identities-v3"; return value
    }
    static func identities() throws -> [DeviceIdentity] {
        var attributes = identitiesQuery
        attributes[kSecReturnData as String] = true; attributes[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(attributes as CFDictionary, &result)
        if status == errSecItemNotFound {
            if let old = loadIdentity() {
                let migrated = DeviceIdentity(server: try PairingTarget.origin(old.server).absoluteString, deviceId: old.deviceId, secret: old.secret)
                try saveIdentities([migrated]); return [migrated]
            }
            return []
        }
        guard status == errSecSuccess, let data = result as? Data else { throw ServiceError(status: 0, message: "无法读取服务凭证，请解锁手机后重试") }
        return try JSONDecoder().decode([DeviceIdentity].self, from: data)
    }
    private static func saveIdentities(_ identities: [DeviceIdentity]) throws {
        let data = try JSONEncoder().encode(identities)
        var status = SecItemUpdate(identitiesQuery as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var attributes = identitiesQuery
            attributes[kSecValueData as String] = data
            attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(attributes as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw ServiceError(status: 0, message: "无法安全保存服务凭证，请重试") }
    }
    static func identity(server: String) throws -> DeviceIdentity {
        let server = try PairingTarget.origin(server).absoluteString
        var all = try identities()
        if let existing = all.first(where: { $0.server == server }) { return existing }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw ServiceError(status: 0, message: "无法创建设备身份，请重试") }
        let identity = DeviceIdentity(server: server, deviceId: UUID().uuidString.lowercased(), secret: bytes.map { String(format: "%02x", $0) }.joined())
        all.append(identity); try saveIdentities(all)
        return identity
    }
    private static var pairQuery: [String: Any] {
        var value = query; value[kSecAttrAccount as String] = "e2ee-pair-keys-v1"; return value
    }
    static func pairedSecrets() throws -> [PairedSecret] {
        var attributes = pairQuery
        attributes[kSecReturnData as String] = true; attributes[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(attributes as CFDictionary, &result)
        if status == errSecItemNotFound { return [] }
        guard status == errSecSuccess, let data = result as? Data else { throw ServiceError(status: 0, message: "无法读取加密密钥，请解锁手机后重试") }
        return try JSONDecoder().decode([PairedSecret].self, from: data).filter { $0.expiresAt > Date().timeIntervalSince1970 * 1000 }
    }
    private static func savePairSecrets(_ values: [PairedSecret]) throws {
        let data = try JSONEncoder().encode(values)
        var status = SecItemUpdate(pairQuery as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var attributes = pairQuery; attributes[kSecValueData as String] = data
            attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(attributes as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw ServiceError(status: 0, message: "无法保存加密密钥，请重新配对") }
    }
    static func savePairSecret(_ value: PairedSecret) throws {
        var all = try pairedSecrets()
        all.removeAll { $0.server == value.server && $0.peerId == value.peerId && $0.deviceId == value.deviceId }
        all.append(value); try savePairSecrets(all)
    }
    static func removePairSecret(server: String, deviceId: String, peerId: String) throws {
        try savePairSecrets(pairedSecrets().filter { !($0.server == server && $0.deviceId == deviceId && $0.peerId == peerId) })
    }
    private static var linksQuery: [String: Any] {
        var value = query; value[kSecAttrAccount as String] = "native-links-v1"; return value
    }
    static func nativeLinks() throws -> [NativeLink] {
        var attributes = linksQuery
        attributes[kSecReturnData as String] = true; attributes[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(attributes as CFDictionary, &result)
        if status == errSecItemNotFound { return [] }
        guard status == errSecSuccess, let data = result as? Data else { throw ServiceError(status: 0, message: "无法读取设备配对，请解锁后重试") }
        return try JSONDecoder().decode([NativeLink].self, from: data)
    }
    static func saveNativeLinks(_ links: [NativeLink]) throws {
        let data = try JSONEncoder().encode(links)
        var status = SecItemUpdate(linksQuery as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var attributes = linksQuery; attributes[kSecValueData as String] = data
            attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(attributes as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw ServiceError(status: 0, message: "无法保存设备配对，请重试") }
    }

}
