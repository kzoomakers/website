import SwiftUI
import GoogleSignIn

@main struct KzooApp: App {
    @StateObject private var session = Session()
    @StateObject private var lock = AppLock()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            Group {
                if !session.signedIn { LoginView() }
                else if lock.locked { LockView() }
                else if session.loading && session.me == nil { ProgressView() }
                else { RootView() }
            }
            .environmentObject(session)
            .environmentObject(lock)
            .task { await session.refresh() }
            .onChange(of: phase) { if $0 == .background { lock.locked = true } }
            .onOpenURL { _ = GIDSignIn.sharedInstance.handle($0) }
        }
    }
}
