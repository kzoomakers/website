import Foundation
import Security

/// Tokens live in the Keychain (a year-long login must not sit in UserDefaults). `member` is the emailed-code token, `admin` the Google one; either or both.
enum Keychain {
    static func get(_ k: String) -> String? {
        var out: AnyObject?
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: k, kSecReturnData as String: true]
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    static func set(_ k: String, _ v: String?) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: k]
        SecItemDelete(q as CFDictionary)
        if let v { SecItemAdd(q.merging([kSecValueData as String: Data(v.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]) { $1 } as CFDictionary, nil) }
    }
}

struct Me: Decodable { let name: String; let admin: Bool }

@MainActor final class Session: ObservableObject {
    @Published var member: String? { didSet { Keychain.set("member", member) } }
    @Published var admin: String? { didSet { Keychain.set("admin", admin) } }
    @Published var me: Me?
    @Published var loading = true
    init() {
        // The Keychain survives deleting the app but UserDefaults doesn't, so a missing flag means a fresh install: start signed out.
        if !UserDefaults.standard.bool(forKey: "installed") { Keychain.set("member", nil); Keychain.set("admin", nil); UserDefaults.standard.set(true, forKey: "installed") }
        member = Keychain.get("member"); admin = Keychain.get("admin")
    }
    var signedIn: Bool { member != nil || admin != nil }

    /// Who the server says we are. A 401 means the token was revoked or expired, so sign out.
    func refresh() async {
        loading = true; defer { loading = false }
        guard signedIn else { me = nil; return }
        do { me = try await API.shared.get("/api/blog/auth", as: Me?.self, session: self) ?? nil; if me == nil { signOut() } }
        catch API.Failure.unauthorized { signOut() } catch { /* offline: keep the token, retry later */ }
    }
    /// Signs out here and on the server (so the token is dead, not just forgotten).
    func signOut() {
        let (m, a) = (member, admin)
        member = nil; admin = nil; me = nil
        Task { await API.shared.logout(member: m, admin: a) }
    }
}
