import Foundation

struct APIClient: Sendable {
    let server: URL
    var token: String?

    static func serverURL(_ value: String) throws -> URL { try PairingTarget.origin(value) }
    private static let session = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)

    func verifyService(requireReplication: Bool = false) async throws {
        struct Info: Decodable { let product: String; let protocolVersion: Int; let pairingLinkVersion: Int; let e2eeVersion: Int?; let replicaVersion: Int? }
        // Probe without credentials, even when this instance has an identity.
        let info: Info
        do { info = try await APIClient(server: server).decode(Info.self, path: "/info") }
        catch is DecodingError { throw ServiceError(status: 0, message: "此网址没有返回兼容的接力服务信息，请检查部署") }
        guard info.product == "relay-clipboard", info.protocolVersion == 3, info.pairingLinkVersion == 2, info.e2eeVersion == 1 else {
            throw ServiceError(status: 0, message: "此服务未支持当前端到端加密协议，请更新部署后重新配对")
        }
        if requireReplication && info.replicaVersion != 1 { throw ServiceError(status: 426, message: "请更新服务以支持多设备同步") }
    }

    func request(_ path: String, method: String = "GET", body: Data? = nil) -> URLRequest {
        let url = URL(string: "/api\(path)", relativeTo: server)!.absoluteURL
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 8)
        request.httpMethod = method
        request.httpBody = body
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("native", forHTTPHeaderField: "X-Client-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }
    func send(_ path: String, method: String = "GET", body: Data? = nil) async throws -> Data? {
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await Self.session.data(for: request(path, method: method, body: body)) }
        catch is CancellationError { throw CancellationError() }
        catch { throw ServiceError(status: 0, message: "暂时无法连接，输入已保留，请恢复网络后重试") }
        guard let http = response as? HTTPURLResponse else { throw ServiceError(status: 0, message: "服务器响应不正确") }
        if (300..<400).contains(http.statusCode) { throw ServiceError(status: http.statusCode, message: "服务网址发生跳转，请使用最终的 HTTPS 网址重新配对") }
        if http.statusCode == 204 { return nil }
        guard (200..<300).contains(http.statusCode) else {
            struct ErrorBody: Decodable { let error: String }
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data).error) ?? "请求失败，请重试"
            throw ServiceError(status: http.statusCode, message: message)
        }
        return data
    }
    func decode<T: Decodable>(_ type: T.Type, path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        guard let data = try await send(path, method: method, body: body) else { throw ServiceError(status: 0, message: "服务器响应为空") }
        return try JSONDecoder().decode(type, from: data)
    }
    func websocket() -> URLSessionWebSocketTask {
        var request = request("/events")
        var components = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
        components.scheme = server.scheme == "https" ? "wss" : "ws"
        components.queryItems = [URLQueryItem(name: "v", value: "3")]
        request.url = components.url
        return Self.session.webSocketTask(with: request)
    }
}

// Never forward identity secrets or note requests to a redirect destination.
private final class NoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
