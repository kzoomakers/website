import SwiftUI

private let dateTime = Date.FormatStyle(date: .abbreviated, time: .shortened)

struct HomeView: View {
    @EnvironmentObject var session: Session
    @State private var home: Home?
    @State private var error = ""

    var body: some View {
        NavigationStack {
            List {
                if !error.isEmpty { Section { Text(error).foregroundStyle(.red) } }
                if let h = home {
                    Section { Text("Welcome, \(h.name.split(separator: " ").first.map(String.init) ?? h.name).").font(.title3) }
                    Section("Your membership") {
                        if h.levels.isEmpty { Text("No membership is on file yet. Ask at the space.").foregroundStyle(.secondary) }
                        ForEach(h.levels) { l in LabeledContent(l.level, value: "since " + l.since.formatted(date: .abbreviated, time: .omitted)) }
                    }
                    Section("Classes") {
                        ForEach(h.classes) { c in ClassRow(c: c) { await load() } }
                        if h.classes.isEmpty { Text("No upcoming classes.").foregroundStyle(.secondary) }
                    }
                    Section("Tool sign-offs") {
                        ForEach(h.auths) { a in
                            LabeledContent(a.name, value: a.expired ? "expired" : a.expires_on.map { "until " + $0 } ?? a.category).foregroundStyle(a.expired ? .red : .primary)
                        }
                        if h.auths.isEmpty { Text("None yet. They happen after an orientation or class.").foregroundStyle(.secondary) }
                    }
                    if !h.visits.isEmpty { Section("Guest visits") { ForEach(h.visits) { v in LabeledContent("\(v.first_name) \(v.last_name)", value: v.at.formatted(dateTime)) } } }
                }
            }
            .navigationTitle("Home")
            .refreshable { await load() }
            .task { await load() }
        }
    }
    private func load() async {
        do { home = try await API.shared.get("/api/mobile/home", as: Home.self, session: session); error = "" }
        catch API.Failure.unauthorized { await session.refresh() } catch { self.error = error.localizedDescription }
    }
}

private struct ClassRow: View {
    @EnvironmentObject var session: Session
    let c: Home.Klass
    let reload: () async -> Void
    @State private var busy = false
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(c.title).font(.headline)
            Text(c.starts_at.formatted(dateTime) + (c.location.isEmpty ? "" : " · " + c.location)).font(.subheadline).foregroundStyle(.secondary)
            HStack {
                Text(c.capacity > 0 ? "\(c.signed)/\(c.capacity) signed up" : "\(c.signed) signed up").font(.caption).foregroundStyle(.secondary)
                Spacer()
                if c.mine != nil { Text(c.mine == "waitlist" ? "Waitlist" : "You're in").font(.caption.bold()).foregroundStyle(.green) }
                Button(c.mine == nil ? "Sign up" : "Leave") { act(c.mine == nil ? "signup" : "cancel") }.buttonStyle(.bordered).disabled(busy)
            }
        }
    }
    private func act(_ op: String) {
        busy = true
        Task { try? await API.shared.send("/api/members", ["op": op, "id": String(c.id)] as [String: String], session: session); await reload(); busy = false }
    }
}
