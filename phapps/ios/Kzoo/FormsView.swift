import SwiftUI

/// Messages from the website's contact, board and donation forms. "Held" ones were caught by the spam filter and need a yes or no.
struct FormsView: View {
    @EnvironmentObject var session: Session
    @State private var status = "held"
    @State private var list: FormList?
    @State private var error = ""
    private static let states = [("held", "Held"), ("sent", "Sent"), ("rejected", "Rejected"), ("all", "All")]

    var body: some View {
        List {
            Picker("Show", selection: $status) { ForEach(Self.states, id: \.0) { Text("\($0.1) \(list?.counts[$0.0].map { "(\($0))" } ?? "")").tag($0.0) } }.pickerStyle(.menu)
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
            ForEach(list?.messages ?? []) { m in
                NavigationLink { FormDetail(m: m).onDisappear { Task { await load() } } } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(m.subject.isEmpty ? "(no subject)" : m.subject).bold().lineLimit(1)
                        Text("\(m.name) · \(m.kind) · \(m.created_at.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary)
                        Text(m.message).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
            }
            if let l = list, l.messages.isEmpty { Text("Nothing here.").foregroundStyle(.secondary) }
        }
        .navigationTitle("Form submissions")
        .refreshable { await load() }
        .task(id: status) { await load() }
    }
    private func load() async {
        do { list = try await API.shared.get("/api/webmaster/forms?status=\(status)", as: FormList.self, session: session); error = "" } catch { self.error = error.localizedDescription }
    }
}

private struct FormDetail: View {
    @EnvironmentObject var session: Session
    @Environment(\.dismiss) private var dismiss
    let m: FormMsg
    @State private var lines: [ThreadLine] = []
    @State private var text = ""
    @State private var status = ""
    private struct Decide: Encodable { let id: Int; let action: String }
    private struct Reply: Encodable { let id: Int; let body: String; let `internal`: Bool }

    var body: some View {
        List {
            if !status.isEmpty { Section { Text(status).font(.footnote) } }
            Section {
                LabeledContent("From", value: "\(m.name) <\(m.email)>")
                Text(m.message)
                if let r = m.reason, !r.isEmpty { Text("Held because: \(r)").font(.footnote).foregroundStyle(.orange) }
            }
            if !lines.isEmpty {
                Section("Conversation") {
                    ForEach(lines) { l in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(l.body).italic(l.kind == "note").foregroundStyle(l.kind == "note" ? .secondary : .primary)
                            Text("\(l.author) · \(l.created_at.formatted(date: .abbreviated, time: .shortened))\(l.kind == "note" ? " · private note" : "")").font(.caption2).foregroundStyle(.tertiary)
                        }
                    }
                }
            }
            Section("Reply") {
                TextField("Message or note", text: $text, axis: .vertical).lineLimit(2...6)
                Button("Email reply to \(m.name)") { Task { await reply(false) } }.disabled(text.isEmpty)
                Button("Save as private note") { Task { await reply(true) } }.disabled(text.isEmpty)
            }
            Section {
                if m.status != "sent" { Button("Approve (let it through)") { Task { await decide("approve") } } }
                if m.status != "rejected" { Button("Reject as spam", role: .destructive) { Task { await decide("reject") } } }
                if m.status == "rejected" { Button("Restore") { Task { await decide("restore") } } }
            }
        }
        .navigationTitle(m.subject.isEmpty ? "Message" : m.subject).navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }
    private func load() async { lines = (try? await API.shared.get("/api/webmaster/forms?thread=\(m.id)", as: [ThreadLine].self, session: session)) ?? [] }
    private func reply(_ note: Bool) async {
        do { _ = try await API.shared.request("POST", "/api/webmaster/forms", body: Reply(id: m.id, body: text, internal: note), session: session); text = ""; status = note ? "Note saved." : "Reply sent."; await load() }
        catch { status = error.localizedDescription }
    }
    private func decide(_ action: String) async {
        do { _ = try await API.shared.request("PATCH", "/api/webmaster/forms", body: Decide(id: m.id, action: action), session: session); dismiss() } catch { status = error.localizedDescription }
    }
}
