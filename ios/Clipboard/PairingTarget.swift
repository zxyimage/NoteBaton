import Foundation

/// Pairing links carry their service origin; no central directory is consulted.
struct PairingTarget: Equatable {
    let server: URL
    let code: String?
    var encryptionKey: String? = nil

    static func origin(_ value: String) throws -> URL {
        let input = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard input.count <= 2048, !input.contains("\\"),
              var c = URLComponents(string: input), let host = c.host, !host.isEmpty,
              c.user == nil, c.password == nil, c.query == nil, c.fragment == nil,
              ["", "/"].contains(c.path), c.port.map({ (1...65535).contains($0) }) ?? true else {
            throw ServiceError(status: 0, message: "请输入完整的服务网址，例如 https://你的域名，不包含路径")
        }
        c.scheme = c.scheme?.lowercased(); c.host = host.lowercased()
        var allowed = c.scheme == "https"
        #if DEBUG
        allowed = allowed || (c.scheme == "http" && ["localhost", "127.0.0.1", "[::1]", "::1"].contains(host.lowercased()))
        #endif
        guard allowed else { throw ServiceError(status: 0, message: "服务网址必须使用 HTTPS") }
        if (c.scheme == "https" && c.port == 443) || (c.scheme == "http" && c.port == 80) { c.port = nil }
        c.path = ""
        guard let url = c.url else { throw ServiceError(status: 0, message: "服务网址不正确") }
        return url
    }
    static func validCode(_ value: String) -> Bool {
        value.range(of: "^RLY-[A-F0-9]{4}(-[A-F0-9]{4}){3}$", options: [.regularExpression, .caseInsensitive]) != nil
    }
    static func parse(_ value: String, manualServer: String = "") throws -> PairingTarget {
        let input = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if input.isEmpty { return PairingTarget(server: try origin(manualServer), code: nil) }
        let parts = input.split(separator: ".", omittingEmptySubsequences: false)
        if parts.count == 2, validCode(String(parts[0])), validKey(String(parts[1])) {
            return PairingTarget(server: try origin(manualServer), code: String(parts[0]).uppercased(), encryptionKey: String(parts[1]))
        }
        if validCode(input) { throw ServiceError(status: 0, message: "旧短码不包含加密密钥，请重新生成并使用完整加密配对链接或配对字符串") }
        guard input.count <= 4096, !input.contains("\\"), var c = URLComponents(string: input),
              c.path == "/pair", c.query == nil, let fragment = c.percentEncodedFragment else {
            throw ServiceError(status: 0, message: "请粘贴网页复制的完整配对链接；只输入短码时，还需填写服务网址")
        }
        let items = URLComponents(string: "https://pair.invalid/?" + fragment)?.queryItems ?? []
        guard items.count == 3, items.filter({ $0.name == "v" }).count == 1,
              items.first(where: { $0.name == "v" })?.value == "2",
              items.filter({ $0.name == "code" }).count == 1,
              items.filter({ $0.name == "key" }).count == 1,
              let key = items.first(where: { $0.name == "key" })?.value, validKey(key),
              let code = items.first(where: { $0.name == "code" })?.value, validCode(code) else {
            throw ServiceError(status: 0, message: "配对链接格式或版本不受支持，请重新生成")
        }
        c.path = ""; c.fragment = nil
        return PairingTarget(server: try origin(c.string ?? ""), code: code.uppercased(), encryptionKey: key)
    }
    static func validKey(_ value: String) -> Bool { value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil }
    static func isPairingInput(_ value: String) -> Bool {
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.uppercased().hasPrefix("RLY-") || (URLComponents(string: value)?.path == "/pair")
    }
}
