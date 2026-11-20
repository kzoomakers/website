import SwiftUI

/// Admin menu: only what this admin may open (the server decides; every data call is checked again there).
struct AdminView: View {
    @EnvironmentObject var session: Session
    @State private var caps: AdminCaps?
    @State private var error = ""

    var body: some View {
        NavigationStack {
            List {
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
                if let c = caps {
                    if c.sections.contains("crm") {
                        Section("Members") {
                            NavigationLink { ApplicantsView() } label: { Label("New members", systemImage: "person.badge.clock") }
                            NavigationLink { PeopleView() } label: { Label("People", systemImage: "person.3") }
                        }
                    }
                    if c.sections.contains("forms") || c.sections.contains("tours") {
                        Section("Inbox") {
                            if c.sections.contains("forms") { NavigationLink { FormsView() } label: { Label("Form submissions", systemImage: "envelope") } }
                            if c.sections.contains("tours") { NavigationLink { ToursView() } label: { Label("Tour bookings", systemImage: "calendar") } }
                        }
                    }
                    if !c.sections.contains("crm") && !c.sections.contains("forms") && !c.sections.contains("tours") { Text("Nothing in the app for your access yet. Use the website.").foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("Admin")
            .task { do { caps = try await API.shared.get("/api/mobile/admin", as: AdminCaps.self, session: session) } catch { self.error = error.localizedDescription } }
        }
    }
}

struct PeopleView: View {
    @EnvironmentObject var session: Session
    @State private var q = ""
    @State private var people: [Person] = []
    @State private var total = 0
    @State private var error = ""

    var body: some View {
        List {
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
            ForEach(people) { p in
                NavigationLink { PersonDetail(p: p) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.name).bold().foregroundStyle(p.disabled ? .red : .primary)
                        Text(p.email).font(.subheadline).foregroundStyle(.secondary)
                        Text(([p.approval] + p.levels + (p.disabled ? ["disabled"] : [])).joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            if total > people.count { Text("Showing \(people.count) of \(total). Search to narrow it down.").font(.footnote).foregroundStyle(.secondary) }
        }
        .navigationTitle("People")
        .searchable(text: $q, prompt: "Name, email or card")
        .task(id: q) { try? await Task.sleep(nanoseconds: 300_000_000); await search() }
    }
    private func search() async {
        guard !Task.isCancelled else { return }
        let enc = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        do { let r = try await API.shared.get("/api/webmaster/people?q=\(enc)", as: PeopleResp.self, session: session); people = r.rows; total = r.total; error = "" }
        catch { if !(error is CancellationError) { self.error = error.localizedDescription } }
    }
}

private struct PersonDetail: View {
    @EnvironmentObject var session: Session
    let p: Person
    @State private var more: PersonMore?
    private struct Req: Encodable { let op = "member"; let id: Int }
    var body: some View {
        List {
            Section { LabeledContent("Email", value: p.email); LabeledContent("Approval", value: p.approval); if p.disabled { Text("This account is disabled.").foregroundStyle(.red) } }
            if let m = more {
                Section("Membership") { ForEach(m.levels, id: \.level) { Text($0.level) }; if m.levels.isEmpty { Text("None on file.").foregroundStyle(.secondary) } }
                Section("Tool sign-offs") {
                    ForEach(m.auths) { a in LabeledContent(a.name, value: a.expired ? "expired" : a.expires_on.map { "until " + $0 } ?? "active").foregroundStyle(a.expired ? .red : .primary) }
                    if m.auths.isEmpty { Text("None.").foregroundStyle(.secondary) }
                }
            }
        }
        .navigationTitle(p.name).navigationBarTitleDisplayMode(.inline)
        .task { more = try? await API.shared.post("/api/webmaster/crm", Req(id: p.id), as: PersonMore.self, session: session) }
    }
}

struct ApplicantsView: View {
    @EnvironmentObject var session: Session
    @State private var state = "pending"
    @State private var list: ApplicantList?
    @State private var error = ""
    private struct Req: Encodable { let op = "applicants"; let state: String }
    private static let states = [("pending", "Pending"), ("waiting", "Waiting"), ("rejected", "Rejected"), ("approved", "Approved")]

    var body: some View {
        List {
            Picker("State", selection: $state) { ForEach(Self.states, id: \.0) { Text("\($0.1) \(list?.counts[$0.0].map { "(\($0))" } ?? "")").tag($0.0) } }
                .pickerStyle(.menu)
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
            ForEach(list?.rows ?? []) { a in
                NavigationLink { ApplicantDetailView(id: a.id) .onDisappear { Task { await load() } } } label: {
                    VStack(alignment: .leading) {
                        HStack { Text(a.name).bold(); if a.last_by_applicant && (state == "pending" || state == "waiting") { Text("replied").font(.caption2.bold()).padding(3).background(.orange, in: Capsule()).foregroundStyle(.white) } }
                        Text("\(a.email) · applied \(a.applied_at.formatted(date: .abbreviated, time: .omitted))").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            if let l = list, l.rows.isEmpty { Text("Nobody here.").foregroundStyle(.secondary) }
        }
        .navigationTitle("New members")
        .refreshable { await load() }
        .task(id: state) { await load() }
    }
    private func load() async {
        do { list = try await API.shared.post("/api/webmaster/crm", Req(state: state), as: ApplicantList.self, session: session); error = "" } catch { self.error = error.localizedDescription }
    }
}

private struct ApplicantDetailView: View {
    @EnvironmentObject var session: Session
    let id: Int
    @State private var d: ApplicantDetail?
    @State private var text = ""
    @State private var waiting = true
    @State private var status = ""
    @State private var confirmApprove = false
    @State private var rejecting = false
    @State private var reason = ""

    private struct Read: Encodable { let op = "applicant"; let id: Int }
    private struct Say: Encodable { let op: String; let id: Int; let body: String; var wait: Bool? }
    private struct Move: Encodable { let op = "applicantMove"; let id: Int; let from: String; let to: String; var confirmed: Bool?; var reason: String? }

    var body: some View {
        List {
            if !status.isEmpty { Section { Text(status).font(.footnote) } }
            if let d {
                Section { LabeledContent("Name", value: "\(d.first_name) \(d.last_name)".trimmingCharacters(in: .whitespaces)); LabeledContent("Email", value: d.email); LabeledContent("State", value: d.approval) }
                Section("Thread") {
                    ForEach(d.events) { e in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.kind == "state" ? "→ \(e.to_state ?? "")" + (e.body.isEmpty ? "" : ": \(e.body)") : e.body).foregroundStyle(e.kind == "note" ? .secondary : .primary).italic(e.kind == "note")
                            Text("\(e.by_applicant ? d.first_name : e.actor) · \(e.at.formatted(date: .abbreviated, time: .shortened))\(e.kind == "note" ? " · private note" : "")").font(.caption2).foregroundStyle(.tertiary)
                        }
                    }
                }
                Section("Reply") {
                    TextField("Message or note", text: $text, axis: .vertical).lineLimit(2...6)
                    Toggle("Wait for their answer", isOn: $waiting)
                    Button("Send to applicant (emails them)") { Task { await act(Say(op: "applicantSay", id: id, body: text, wait: waiting)) } }.disabled(text.isEmpty)
                    Button("Save as private note") { Task { await act(Say(op: "applicantNote", id: id, body: text)) } }.disabled(text.isEmpty)
                }
                Section("Decide") {
                    if d.approval != "approved" { Button("Approve") { confirmApprove = true } }
                    if d.approval != "rejected" { Button("Reject", role: .destructive) { rejecting = true } }
                    if d.approval == "approved" || d.approval == "rejected" { Button("Move back to pending") { Task { await act(Move(id: id, from: d.approval, to: "pending")) } } }
                }
            }
        }
        .navigationTitle(d?.name ?? "Applicant").navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Approve \(d?.name ?? "")? This emails them a welcome and starts their onboarding. Have you checked their name and contact details?", isPresented: $confirmApprove, titleVisibility: .visible) {
            Button("Yes, approve") { if let d { Task { await act(Move(id: id, from: d.approval, to: "approved", confirmed: true)) } } }
        }
        .alert("Reject \(d?.name ?? "")?", isPresented: $rejecting) {
            TextField("Reason (they'll see it)", text: $reason)
            Button("Reject", role: .destructive) { if let d { Task { await act(Move(id: id, from: d.approval, to: "rejected", reason: reason)) } } }
            Button("Cancel", role: .cancel) {}
        }
        .task { await load() }
    }

    private func load() async { do { d = try await API.shared.post("/api/webmaster/crm", Read(id: id), as: ApplicantDetail.self, session: session) } catch { status = error.localizedDescription } }
    private func act<B: Encodable>(_ body: B) async {
        do { try await API.shared.send("/api/webmaster/crm", body, session: session); text = ""; reason = ""; status = "Done."; await load() } catch { status = error.localizedDescription }
    }
}
