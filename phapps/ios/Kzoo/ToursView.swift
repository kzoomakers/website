import SwiftUI

/// Booked tours of the space. Walk-up requests and tour times (availability) are still on the website.
struct ToursView: View {
    @EnvironmentObject var session: Session
    @State private var bookings: [TourBooking] = []
    @State private var past = false
    @State private var error = ""
    private struct Req: Encodable { let op = "bookings"; let past: Bool }

    var body: some View {
        List {
            Picker("Show", selection: $past) { Text("Upcoming").tag(false); Text("Past").tag(true) }.pickerStyle(.segmented)
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
            ForEach(bookings) { b in
                NavigationLink { TourDetail(b: b).onDisappear { Task { await load() } } } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack { Text(b.name).bold(); if b.status == "cancelled" { Text("cancelled").font(.caption).foregroundStyle(.red) } }
                        Text("\(b.date) at \(b.start_time) · \(label(b.status))\(b.guide_name.isEmpty ? "" : " · guide \(b.guide_name)")").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            if bookings.isEmpty && error.isEmpty { Text("No bookings.").foregroundStyle(.secondary) }
        }
        .navigationTitle("Tour bookings")
        .refreshable { await load() }
        .task(id: past) { await load() }
    }
    private func load() async {
        do { bookings = try await API.shared.post("/api/webmaster/tours", Req(past: past), as: [TourBooking].self, session: session); error = "" } catch { self.error = error.localizedDescription }
    }
}

func label(_ status: String) -> String { status.replacingOccurrences(of: "_", with: " ").capitalized }

private struct TourDetail: View {
    @EnvironmentObject var session: Session
    let b: TourBooking
    @State private var current: String
    @State private var lines: [ThreadLine] = []
    @State private var text = ""
    @State private var note = false
    @State private var status = ""
    @State private var confirmCancel = false
    private static let statuses = ["booked", "no_show", "signed_up", "sign_up_later", "maybe_later", "no_interest"]
    private struct SetStatus: Encodable { let op = "setStatus"; let id: Int; let status: String }
    private struct Post: Encodable { let op = "post"; let kind = "booking"; let id: Int; let body: String; let `internal`: Bool }
    private struct Thread: Encodable { let op = "thread"; let kind = "booking"; let id: Int }
    private struct Cancel: Encodable { let op = "cancel"; let id: Int }

    init(b: TourBooking) { self.b = b; _current = State(initialValue: b.status) }

    var body: some View {
        List {
            if !status.isEmpty { Section { Text(status).font(.footnote) } }
            Section {
                LabeledContent("When", value: "\(b.date) at \(b.start_time)")
                LabeledContent("Email", value: b.email)
                if !b.phone.isEmpty { LabeledContent("Phone", value: b.phone) }
                if !b.interest.isEmpty { LabeledContent("Interested in", value: b.interest) }
                if !b.heard.isEmpty { LabeledContent("Heard from", value: b.heard) }
                if !b.visitor_notes.isEmpty { Text(b.visitor_notes) }
            }
            if current != "cancelled" {
                Section("Outcome") {
                    Picker("Status", selection: $current) { ForEach(Self.statuses, id: \.self) { Text(label($0)).tag($0) } }
                        .onChange(of: current) { s in Task { await setStatus(s) } }
                }
            }
            if !lines.isEmpty {
                Section("Messages") {
                    ForEach(lines) { l in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(l.body).italic(l.kind == "note")
                            Text("\(l.kind == "visitor" ? b.name : l.author) · \(l.created_at.formatted(date: .abbreviated, time: .shortened))\(l.kind == "note" ? " · private note" : "")").font(.caption2).foregroundStyle(.tertiary)
                        }
                    }
                }
            }
            Section("Write") {
                TextField("Message", text: $text, axis: .vertical).lineLimit(2...6)
                Toggle("Private note (not emailed)", isOn: $note)
                Button(note ? "Save note" : "Email \(b.name)") { Task { await post() } }.disabled(text.isEmpty)
            }
            if current != "cancelled" { Section { Button("Cancel this booking", role: .destructive) { confirmCancel = true } } }
        }
        .navigationTitle(b.name).navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Cancel \(b.name)'s tour? They are told by email.", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Cancel the booking", role: .destructive) { Task { await cancel() } }
        }
        .task { await load() }
    }
    private func load() async { lines = (try? await API.shared.post("/api/webmaster/tours", Thread(id: b.id), as: [ThreadLine].self, session: session)) ?? [] }
    private func setStatus(_ s: String) async {
        do { try await API.shared.send("/api/webmaster/tours", SetStatus(id: b.id, status: s), session: session); status = "Saved." } catch { status = error.localizedDescription; current = b.status }
    }
    private func post() async {
        do { try await API.shared.send("/api/webmaster/tours", Post(id: b.id, body: text, internal: note), session: session); text = ""; status = note ? "Note saved." : "Sent."; await load() } catch { status = error.localizedDescription }
    }
    private func cancel() async {
        do { try await API.shared.send("/api/webmaster/tours", Cancel(id: b.id), session: session); current = "cancelled"; status = "Cancelled." } catch { status = error.localizedDescription }
    }
}
