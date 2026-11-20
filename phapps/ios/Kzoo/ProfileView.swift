import SwiftUI
import PhotosUI

private let RELATIONSHIPS = ["Parent", "Sibling", "Friend", "Spouse", "Significant other", "Guardian", "Adult child", "Other"] // same list as the website

/// What a member may edit about themselves (web/lib/profiles.ts SELF_FIELDS). Email and staff-only fields are not here.
private struct Fields: Codable {
    var first_name = "", last_name = "", phone = "", address1 = "", address2 = "", city = "", state = "", zip = "", gender = "", pronouns = ""
}
private struct ContactBody: Encodable { var id: Int?; var first_name = "", last_name = "", phone = "", relationship = "Friend", address = "", business_phone = "" }

struct ProfileView: View {
    @EnvironmentObject var session: Session
    @State private var f = Fields()
    @State private var email = ""
    @State private var contacts: [Contact] = []
    @State private var editing: ContactBody?
    @State private var status = ""
    @State private var pick: PhotosPickerItem?

    var body: some View {
        Group {
            Form {
                if !status.isEmpty { Section { Text(status).font(.footnote) } }
                Section("Details") {
                    TextField("First name", text: $f.first_name).textContentType(.givenName)
                    TextField("Last name", text: $f.last_name).textContentType(.familyName)
                    TextField("Phone", text: $f.phone).textContentType(.telephoneNumber).keyboardType(.phonePad)
                    TextField("Address", text: $f.address1).textContentType(.streetAddressLine1)
                    TextField("Address 2", text: $f.address2).textContentType(.streetAddressLine2)
                    TextField("City", text: $f.city).textContentType(.addressCity)
                    TextField("State", text: $f.state).textContentType(.addressState)
                    TextField("ZIP", text: $f.zip).textContentType(.postalCode).keyboardType(.numbersAndPunctuation)
                    TextField("Pronouns", text: $f.pronouns)
                    LabeledContent("Email", value: email).foregroundStyle(.secondary)
                    Button("Save details") { Task { await save() } }
                }
                Section("Emergency contacts") {
                    ForEach(contacts) { c in
                        Button { editing = ContactBody(id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone, relationship: c.relationship, address: c.address ?? "", business_phone: c.business_phone ?? "") } label: {
                            VStack(alignment: .leading) { Text("\(c.first_name) \(c.last_name)").foregroundStyle(.primary); Text("\(c.relationship) · \(c.phone)").font(.caption).foregroundStyle(.secondary) }
                        }
                    }.onDelete { i in Task { for x in i { await remove(contacts[x]) } } }
                    Button("Add a contact") { editing = ContactBody() }
                }
                Section("Directory photo") {
                    PhotosPicker("Choose a photo", selection: $pick, matching: .images)
                    Button("Remove photo", role: .destructive) { Task { await removePhoto() } }
                }
                Section { Button("Sign out", role: .destructive) { session.signOut() } }
            }
            .navigationTitle("Profile")
            .task { await load() }
            .onChange(of: pick) { item in if let item { Task { await upload(item) } } }
            .sheet(item: Binding(get: { editing.map { Editing(c: $0) } }, set: { editing = $0?.c })) { e in
                ContactForm(c: e.c) { saved in editing = nil; if let saved { Task { await saveContact(saved) } } }
            }
        }
    }

    private func load() async {
        do {
            let a = try await API.shared.get("/api/account", as: Account.self, session: session), p = a.profile
            f = Fields(first_name: p.first_name ?? "", last_name: p.last_name ?? "", phone: p.phone ?? "", address1: p.address1 ?? "", address2: p.address2 ?? "", city: p.city ?? "", state: p.state ?? "", zip: p.zip ?? "", gender: p.gender ?? "", pronouns: p.pronouns ?? "")
            email = p.email ?? ""; contacts = a.contacts
        } catch { status = error.localizedDescription }
    }
    private func save() async {
        do { try await API.shared.put("/api/account", f, session: session); status = "Saved." } catch { status = error.localizedDescription }
    }
    private func saveContact(_ c: ContactBody) async {
        do { contacts = try await API.shared.post("/api/account", c, as: [Contact].self, session: session); status = "Contact saved." } catch { status = error.localizedDescription }
    }
    private func remove(_ c: Contact) async {
        do { contacts = try await API.shared.delete("/api/account?contact=\(c.id)", as: [Contact].self, session: session) } catch { status = error.localizedDescription }
    }
    private func removePhoto() async {
        do { _ = try await API.shared.request("DELETE", "/api/members/photo", session: session); status = "Photo removed." } catch { status = error.localizedDescription }
    }
    /// Shrinks the photo first: phone photos are several MB, the server limits uploads.
    private func upload(_ item: PhotosPickerItem) async {
        defer { pick = nil }
        guard let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) else { status = "Couldn't read that photo."; return }
        let scale = min(1, 1200 / max(img.size.width, img.size.height))
        let small = UIGraphicsImageRenderer(size: CGSize(width: img.size.width * scale, height: img.size.height * scale)).image { _ in img.draw(in: CGRect(origin: .zero, size: CGSize(width: img.size.width * scale, height: img.size.height * scale))) }
        do { try await API.shared.upload("/api/members/photo", file: small.jpegData(compressionQuality: 0.8) ?? data, name: "photo.jpg", mime: "image/jpeg", session: session); status = "Photo updated." }
        catch { status = error.localizedDescription }
    }
}

private struct Editing: Identifiable { let c: ContactBody; var id: Int { c.id ?? -1 } }

private struct ContactForm: View {
    @State var c: ContactBody
    let done: (ContactBody?) -> Void
    var body: some View {
        NavigationStack {
            Form {
                TextField("First name", text: $c.first_name)
                TextField("Last name", text: $c.last_name)
                TextField("Phone", text: $c.phone).keyboardType(.phonePad)
                Picker("Relationship", selection: $c.relationship) { ForEach(RELATIONSHIPS, id: \.self) { Text($0) } }
                TextField("Address (optional)", text: $c.address)
                TextField("Business phone (optional)", text: $c.business_phone).keyboardType(.phonePad)
            }
            .navigationTitle(c.id == nil ? "New contact" : "Edit contact").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { done(nil) } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { done(c) }.disabled(c.first_name.isEmpty || c.last_name.isEmpty || c.phone.isEmpty) }
            }
        }
    }
}
