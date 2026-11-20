import SwiftUI

struct InboxView: View {
    @EnvironmentObject var session: Session
    @State private var inbox: Inbox?
    @State private var error = ""

    var body: some View {
        NavigationStack {
            List {
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
                if let i = inbox {
                    Section("Messages") {
                        ForEach(i.conversations) { c in
                            NavigationLink { ConversationView(id: c.id, name: c.name).onDisappear { Task { await load() } } } label: {
                                HStack {
                                    VStack(alignment: .leading) { Text(c.name).bold(); Text((c.mine ? "You: " : "") + c.body).lineLimit(1).foregroundStyle(.secondary) }
                                    Spacer()
                                    if c.unread > 0 { Text("\(c.unread)").font(.caption.bold()).padding(6).background(.red, in: Circle()).foregroundStyle(.white) }
                                }
                            }
                        }
                        if i.conversations.isEmpty { Text("No messages yet.").foregroundStyle(.secondary) }
                    }
                    if !i.notices.isEmpty {
                        Section("Notices") {
                            ForEach(i.notices) { n in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(n.title).bold(n.read == false)
                                    if let b = n.body, !b.isEmpty { Text(b).font(.subheadline).foregroundStyle(.secondary).lineLimit(3) }
                                    Text(n.at.formatted(.relative(presentation: .named))).font(.caption).foregroundStyle(.tertiary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Inbox")
            .refreshable { await load() }
            .task { await load() }
        }
    }
    private func load() async {
        do {
            inbox = try await API.shared.get("/api/mobile/inbox", as: Inbox.self, session: session); error = ""
            let unread = inbox?.notices.filter { !$0.read }.map(\.id) ?? []
            if !unread.isEmpty { try? await API.shared.send("/api/notifications", ["ids": unread], session: session) } // opening the inbox reads the notices, as on the website
        } catch API.Failure.unauthorized { await session.refresh() } catch { self.error = error.localizedDescription }
    }
}

struct ConversationView: View {
    @EnvironmentObject var session: Session
    let id: Int, name: String
    @State private var thread: Thread?
    @State private var draft = ""
    @State private var error = ""

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(thread?.messages ?? []) { m in
                            Text(m.body).padding(10).foregroundStyle(m.mine ? .white : .primary)
                                .background(m.mine ? Color.accentColor : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                                .frame(maxWidth: .infinity, alignment: m.mine ? .trailing : .leading).id(m.id)
                        }
                    }.padding()
                }
                .onChange(of: thread?.messages.last?.id) { if let l = $0 { proxy.scrollTo(l, anchor: .bottom) } }
            }
            if !error.isEmpty { Text(error).foregroundStyle(.red).font(.footnote).padding(.horizontal) }
            if thread?.canReply ?? true {
                HStack {
                    TextField("Message", text: $draft, axis: .vertical).textFieldStyle(.roundedBorder).lineLimit(1...4)
                    Button("Send") { Task { await send() } }.disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                }.padding()
            } else { Text("This member isn't taking messages.").font(.footnote).foregroundStyle(.secondary).padding() }
        }
        .navigationTitle(name).navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }
    private func load() async { thread = try? await API.shared.get("/api/mobile/inbox?with=\(id)", as: Thread.self, session: session) }
    private func send() async {
        do { try await API.shared.send("/api/members", MessageBody(op: "message", to: id, body: draft), session: session); draft = ""; error = ""; await load() }
        catch { self.error = error.localizedDescription }
    }
}
private struct MessageBody: Encodable { let op: String; let to: Int; let body: String }
