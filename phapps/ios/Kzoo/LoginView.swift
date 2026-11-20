import SwiftUI
import GoogleSignIn

/// No sign-up here: members get an emailed code (they must already have an approved account); admins use Google, as on the website.
struct LoginView: View {
    @EnvironmentObject var session: Session
    @EnvironmentObject var lock: AppLock
    @State private var email = ""
    @State private var code = ""
    @State private var sent = false
    @State private var busy = false
    @State private var error = ""

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("Kzoomakers").font(.largeTitle.bold())
            Text("Members and admins only").foregroundStyle(.secondary)
            TextField("Email", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                .textFieldStyle(.roundedBorder).disabled(sent)
            if sent {
                TextField("6-digit code", text: $code).textContentType(.oneTimeCode).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                Button("Sign in") { run { try await verify() } }.buttonStyle(.borderedProminent).disabled(code.count != 6 || busy)
                Button("Use a different email") { sent = false; code = ""; error = "" }.font(.footnote)
            } else {
                Button("Email me a code") { run { try await send() } }.buttonStyle(.borderedProminent).disabled(email.isEmpty || busy)
            }
            if !error.isEmpty { Text(error).foregroundStyle(.red).font(.footnote).multilineTextAlignment(.center) }
            Divider().padding(.vertical, 8)
            Button("Admin sign-in with Google") { run { try await google() } }.disabled(busy)
            Spacer()
        }.padding(24).frame(maxWidth: 420)
    }

    private func run(_ f: @escaping () async throws -> Void) {
        busy = true; error = ""
        Task { do { try await f() } catch { self.error = error.localizedDescription }; busy = false }
    }
    private struct Ok: Decodable { let ok: Bool }
    private struct Tok: Decodable { let token: String }
    private func send() async throws {
        _ = try await API.shared.post("/api/mobile/code", ["email": email], as: Ok.self, session: nil); sent = true
    }
    private func verify() async throws {
        session.member = try await API.shared.post("/api/mobile/verify", ["email": email, "code": code, "device": API.device], as: Tok.self, session: nil).token
        lock.locked = false // they just proved who they are
        await session.refresh()
    }
    private func google() async throws {
        guard let root = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow?.rootViewController }).first else { return }
        let r = try await GIDSignIn.sharedInstance.signIn(withPresenting: root)
        guard let id = r.user.idToken?.tokenString else { throw API.Failure.server("Google didn't return a sign-in token.") }
        session.admin = try await API.shared.post("/api/mobile/google", ["idToken": id, "device": API.device], as: Tok.self, session: nil).token
        lock.locked = false
        await session.refresh()
    }
}
