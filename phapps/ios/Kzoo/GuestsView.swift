import SwiftUI
import CoreImage.CIFilterBuiltins

/// The host's side of bringing a guest. The guest fills in their own details, agreement and ID photo on their phone via the private link or QR code.
struct GuestsView: View {
    @EnvironmentObject var session: Session
    @State private var guests: [GuestBrief] = []
    @State private var opened: Int?
    @State private var error = ""

    var body: some View {
        List {
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
            ForEach(guests) { g in
                NavigationLink { GuestDetail(id: g.id) } label: {
                    VStack(alignment: .leading) { Text(g.title).bold(); Text(g.status).font(.subheadline).foregroundStyle(g.ready ? .green : .secondary) }
                }
            }
            if guests.isEmpty && error.isEmpty { Text("No guests yet. Tap + to bring one.").foregroundStyle(.secondary) }
        }
        .navigationTitle("My guests")
        .toolbar { Button { Task { await add() } } label: { Image(systemName: "plus") } }
        .navigationDestination(isPresented: Binding(get: { opened != nil }, set: { if !$0 { opened = nil } })) { if let id = opened { GuestDetail(id: id) } } // iOS 16 form
        .refreshable { await load() }
        .task { await load() }
    }
    private func load() async {
        do { guests = try await API.shared.get("/api/guests", as: GuestList.self, session: session).guests; error = "" } catch { self.error = error.localizedDescription }
    }
    private struct Created: Decodable { let id: Int }
    private func add() async {
        do { opened = try await API.shared.post("/api/guests", ["op": "create"], as: Created.self, session: session).id; await load() } catch { self.error = error.localizedDescription }
    }
}

private struct GuestDetail: View {
    @EnvironmentObject var session: Session
    @Environment(\.dismiss) private var dismiss
    let id: Int
    @State private var guest: GuestBrief?
    @State private var link: URL?
    @State private var email = ""
    @State private var status = ""
    @State private var confirmDelete = false

    var body: some View {
        List {
            if !status.isEmpty { Section { Text(status).font(.footnote) } }
            if let g = guest {
                Section { Text(g.status).foregroundStyle(g.ready ? .green : .primary) }
                Section("Their paperwork") {
                    if let link {
                        Image(uiImage: qr(link.absoluteString)).interpolation(.none).resizable().scaledToFit().frame(maxWidth: 240).frame(maxWidth: .infinity)
                        ShareLink("Share the link", item: link)
                    } else { Button("Show QR code and link") { Task { await mint() } } }
                    HStack { TextField("Email it to…", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never); Button("Send") { Task { await mail() } }.disabled(!email.contains("@")) }
                }
                Section { Button("Check in today") { Task { await checkIn() } }.disabled(!g.ready) }
                Section { Button("Delete this guest", role: .destructive) { confirmDelete = true } }
            }
        }
        .navigationTitle(guest?.title ?? "Guest").navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Delete this guest and everything on file for them?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await remove() } }
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private struct Op: Encodable { let op: String; let g: Int; var to: String? }
    private struct Link: Decodable { let url: URL }
    private func load() async { guest = try? await API.shared.get("/api/guests?g=\(id)", as: GuestOne.self, session: session).guest }
    private func mint() async {
        do { link = try await API.shared.post("/api/guests", Op(op: "link", g: id), as: Link.self, session: session).url } catch { status = error.localizedDescription }
    }
    private func mail() async {
        do { try await API.shared.send("/api/guests", Op(op: "emailLink", g: id, to: email), session: session); status = "Sent to \(email)."; email = "" } catch { status = error.localizedDescription }
    }
    private func checkIn() async {
        do {
            let c = try await API.shared.post("/api/guests", Op(op: "checkin", g: id), as: CheckIn.self, session: session)
            status = c.already ? "Already checked in today." : "Checked in." + (c.nag ? " That's \(c.week) days this week, which is over the club's guest limit." : "")
            await load()
        } catch { status = error.localizedDescription }
    }
    private func remove() async {
        do { try await API.shared.send("/api/guests", Op(op: "delete", g: id), session: session); dismiss() } catch { status = error.localizedDescription }
    }
    private func qr(_ s: String) -> UIImage {
        let f = CIFilter.qrCodeGenerator(); f.message = Data(s.utf8)
        guard let out = f.outputImage, let cg = CIContext().createCGImage(out, from: out.extent) else { return UIImage() }
        return UIImage(cgImage: cg)
    }
}
