import UIKit

/// Thin client over the website's existing JSON endpoints: same URLs and bodies the web pages use, with the Keychain tokens as headers.
final class API {
    static let shared = API()
    enum Failure: LocalizedError {
        case unauthorized, server(String)
        var errorDescription: String? { if case .server(let m) = self { return m } else { return "Please sign in again." } }
    }
    let base = URL(string: "https://" + (Bundle.main.object(forInfoDictionaryKey: "ApiHost") as? String ?? "kzoomakers.org"))!

    @MainActor func request(_ method: String, _ path: String, body: Encodable? = nil, session: Session?) async throws -> Data {
        var r = URLRequest(url: URL(string: path, relativeTo: base)!)
        r.httpMethod = method
        if let body { r.httpBody = try JSONEncoder().encode(AnyEncodable(body)); r.setValue("application/json", forHTTPHeaderField: "content-type") }
        if let t = session?.member { r.setValue("Bearer " + t, forHTTPHeaderField: "authorization") }
        if let t = session?.admin { r.setValue(t, forHTTPHeaderField: "x-admin-token") }
        let (d, resp) = try await URLSession.shared.data(for: r)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 && session?.signedIn == true { throw Failure.unauthorized }
        guard (200..<300).contains(code) else { throw Failure.server(String(data: d, encoding: .utf8).flatMap { $0.isEmpty ? nil : $0 } ?? "Something went wrong (\(code)).") }
        return d
    }
    /// Tells the server to delete this device's tokens. Best effort: offline sign-out still clears the phone.
    func logout(member: String?, admin: String?) async {
        guard member != nil || admin != nil else { return }
        var r = URLRequest(url: URL(string: "/api/mobile/logout", relativeTo: base)!)
        r.httpMethod = "POST"
        if let member { r.setValue("Bearer " + member, forHTTPHeaderField: "authorization") }
        if let admin { r.setValue(admin, forHTTPHeaderField: "x-admin-token") }
        _ = try? await URLSession.shared.data(for: r)
    }
    /// Shown in Admin > Auth tokens so a lost phone can be told apart.
    static var device: String { "\(UIDevice.current.model) · iOS \(UIDevice.current.systemVersion)" }
    /// The server sends dates as ISO 8601, with or without fractional seconds.
    static let decoder: JSONDecoder = {
        let d = JSONDecoder(), f = ISO8601DateFormatter(), g = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; g.formatOptions = [.withInternetDateTime]
        d.dateDecodingStrategy = .custom { dec in
            let s = try dec.singleValueContainer().decode(String.self)
            guard let date = f.date(from: s) ?? g.date(from: s) else { throw DecodingError.dataCorrupted(.init(codingPath: dec.codingPath, debugDescription: "bad date \(s)")) }
            return date
        }
        return d
    }()
    /// Sends one file as multipart form data (field "file"), like the website's upload forms.
    @MainActor func upload(_ path: String, file: Data, name: String, mime: String, session: Session?) async throws {
        let boundary = UUID().uuidString
        var r = URLRequest(url: URL(string: path, relativeTo: base)!)
        r.httpMethod = "POST"
        r.setValue("multipart/form-data; boundary=" + boundary, forHTTPHeaderField: "content-type")
        if let t = session?.member { r.setValue("Bearer " + t, forHTTPHeaderField: "authorization") }
        if let t = session?.admin { r.setValue(t, forHTTPHeaderField: "x-admin-token") }
        var body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(name)\"\r\nContent-Type: \(mime)\r\n\r\n".utf8)
        body.append(file); body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        let (d, resp) = try await URLSession.shared.upload(for: r, from: body)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw Failure.server(String(data: d, encoding: .utf8).flatMap { $0.isEmpty ? nil : $0 } ?? "Upload failed (\(code)).") }
    }
    /// POST where only success matters (the server answers {ok:true}).
    @MainActor func send(_ path: String, _ body: Encodable, session: Session?) async throws { _ = try await request("POST", path, body: body, session: session) }
    @MainActor func put(_ path: String, _ body: Encodable, session: Session?) async throws { _ = try await request("PUT", path, body: body, session: session) }
    @MainActor func delete<T: Decodable>(_ path: String, as: T.Type, session: Session?) async throws -> T {
        try Self.decoder.decode(T.self, from: try await request("DELETE", path, session: session))
    }
    @MainActor func get<T: Decodable>(_ path: String, as: T.Type, session: Session?) async throws -> T {
        try Self.decoder.decode(T.self, from: try await request("GET", path, session: session))
    }
    @MainActor func post<T: Decodable>(_ path: String, _ body: Encodable, as: T.Type, session: Session?) async throws -> T {
        try Self.decoder.decode(T.self, from: try await request("POST", path, body: body, session: session))
    }
}
private struct AnyEncodable: Encodable { let v: Encodable; init(_ v: Encodable) { self.v = v }; func encode(to e: Encoder) throws { try v.encode(to: e) } }
