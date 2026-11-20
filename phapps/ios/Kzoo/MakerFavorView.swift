import SwiftUI

/// Chores: start one (a timer runs), finish it, or log time after the fact. Hours are everyone's volunteer totals.
struct MakerFavorView: View {
    @EnvironmentObject var session: Session
    @State private var data: Chores?
    @State private var period = "this_month"
    @State private var logging: Chores.Chore?
    @State private var minutes = ""
    @State private var error = ""

    private struct Op: Encodable { let op: String; var chore_id: Int?; var shift_id: Int?; var minutes: Int?; var period: String? }

    var body: some View {
        List {
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
            if let d = data {
                if !d.mine.isEmpty {
                    Section("On the clock") {
                        ForEach(d.mine) { s in
                            HStack {
                                VStack(alignment: .leading) { Text(s.chore).bold(); Text(Date(timeIntervalSince1970: s.started_at), style: .timer).font(.title3.monospacedDigit()) }
                                Spacer()
                                Button("Finish") { run(Op(op: "finish", shift_id: s.id)) }.buttonStyle(.borderedProminent)
                            }
                        }
                    }
                }
                Section("To do") {
                    ForEach(d.chores.sorted { ($0.overdue_days ?? -.infinity) > ($1.overdue_days ?? -.infinity) }) { c in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(c.title).bold()
                            Text(c.due).font(.subheadline).foregroundStyle((c.overdue_days ?? -1) > 0 ? .red : .secondary)
                            if !c.being_done_by.isEmpty { Text("\(c.being_done_by.joined(separator: ", ")) on it").font(.caption).foregroundStyle(.secondary) }
                            else if let by = c.last_by, let at = c.last_done_at { Text("Last: \(Date(timeIntervalSince1970: at).formatted(date: .abbreviated, time: .omitted)) by \(by)").font(.caption).foregroundStyle(.secondary) }
                            HStack {
                                Button("Start") { run(Op(op: "start", chore_id: c.id)) }.buttonStyle(.borderedProminent)
                                Button("Log time") { minutes = ""; logging = c }.buttonStyle(.bordered)
                            }.padding(.top, 2)
                        }.padding(.vertical, 2)
                    }
                    if d.chores.isEmpty { Text("No chores set up.").foregroundStyle(.secondary) }
                }
                Section("Volunteer hours") {
                    Picker("Period", selection: $period) { Text("Week").tag("this_week"); Text("Month").tag("this_month"); Text("Year").tag("this_year"); Text("All").tag("all_time") }.pickerStyle(.segmented)
                    ForEach(d.hours) { h in LabeledContent(h.name, value: h.hours < 1 ? "\(Int((h.hours * 60).rounded())) min" : String(format: "%.1f h", h.hours)) }
                    if d.hours.isEmpty { Text("Nothing logged in this period.").foregroundStyle(.secondary) }
                }
            }
        }
        .navigationTitle("MakerFavor")
        .refreshable { await load() }
        .task(id: period) { await load() }
        .alert("How many minutes?", isPresented: Binding(get: { logging != nil }, set: { if !$0 { logging = nil } })) {
            TextField("Minutes", text: $minutes).keyboardType(.numberPad)
            Button("Log") { if let c = logging, let m = Int(minutes), m > 0 { run(Op(op: "log", chore_id: c.id, minutes: m)) } }
            Button("Cancel", role: .cancel) {}
        } message: { Text(logging?.title ?? "") }
    }

    private func load() async {
        do { data = try await API.shared.post("/api/members/makerfavor", Op(op: "overview", period: period), as: Chores.self, session: session); error = "" } catch { self.error = error.localizedDescription }
    }
    private func run(_ op: Op) {
        Task { do { try await API.shared.send("/api/members/makerfavor", op, session: session); await load() } catch { self.error = error.localizedDescription } }
    }
}
