import SwiftUI
import LocalAuthentication

/// Locks the app on launch and whenever it goes to the background, since the sign-in lasts a year. Face ID, or the device passcode if that fails.
@MainActor final class AppLock: ObservableObject {
    @Published var locked = true
    func unlock() async {
        let c = LAContext()
        // No passcode on the phone means nothing to lock with; the phone itself is then unprotected.
        guard c.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { locked = false; return }
        locked = !((try? await c.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock Kzoomakers")) ?? false)
    }
}

struct LockView: View {
    @EnvironmentObject var lock: AppLock
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "lock.fill").font(.system(size: 44))
            Button("Unlock") { Task { await lock.unlock() } }.buttonStyle(.borderedProminent)
        }.frame(maxWidth: .infinity, maxHeight: .infinity).background(.background).task { await lock.unlock() }
    }
}
