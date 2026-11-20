import SwiftUI

struct MoreView: View {
    var body: some View {
        NavigationStack {
            List {
                NavigationLink { MakerFavorView() } label: { Label("MakerFavor chores", systemImage: "checklist") }
                NavigationLink { GuestsView() } label: { Label("My guests", systemImage: "person.badge.plus") }
                NavigationLink { ProfileView() } label: { Label("Profile", systemImage: "person.crop.circle") }
            }.navigationTitle("More")
        }
    }
}
