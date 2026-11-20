import SwiftUI

/// Members who opted in to the directory. Contact goes through the message relay, as on the website.
struct DirectoryView: View {
    @EnvironmentObject var session: Session
    @State private var q = ""
    @State private var people: [Listing] = []
    @State private var error = ""

    var body: some View {
        NavigationStack {
            List {
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
                ForEach(people) { p in
                    NavigationLink { ProfileDetail(p: p) } label: {
                        VStack(alignment: .leading) { Text(p.name).bold(); if !p.skills.isEmpty { Text(p.skills.map(\.name).joined(separator: ", ")).font(.subheadline).foregroundStyle(.secondary).lineLimit(1) } }
                    }
                }
                if people.isEmpty && error.isEmpty { Text("No members found.").foregroundStyle(.secondary) }
            }
            .navigationTitle("Directory")
            .searchable(text: $q, prompt: "Name or skill")
            .task(id: q) { try? await Task.sleep(nanoseconds: 300_000_000); await search() } // waits for a pause in typing; a new keystroke cancels this one
        }
    }
    private func search() async {
        guard !Task.isCancelled else { return }
        do { people = try await API.shared.post("/api/members", SearchBody(op: "search", q: q), as: [Listing].self, session: session); error = "" }
        catch { if !(error is CancellationError) { self.error = error.localizedDescription } }
    }
}
private struct SearchBody: Encodable { let op: String; let q: String }

private struct ProfileDetail: View {
    @EnvironmentObject var session: Session
    let p: Listing
    @State private var draft = ""
    @State private var status = ""
    var body: some View {
        List {
            if !p.bio.isEmpty { Section { Text(p.bio) } }
            Section("Skills") { ForEach(p.skills) { LabeledContent($0.name, value: $0.level) }; if p.skills.isEmpty { Text("None listed.").foregroundStyle(.secondary) } }
            Section("Send a message") {
                TextField("Message", text: $draft, axis: .vertical).lineLimit(2...6)
                Button("Send") { Task {
                    do { try await API.shared.send("/api/members", MsgBody(op: "message", to: p.id, body: draft), session: session); draft = ""; status = "Sent." } catch { status = error.localizedDescription }
                } }.disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                if !status.isEmpty { Text(status).font(.footnote).foregroundStyle(.secondary) }
            }
        }.navigationTitle(p.name).navigationBarTitleDisplayMode(.inline)
    }
}
private struct MsgBody: Encodable { let op: String; let to: Int; let body: String }
