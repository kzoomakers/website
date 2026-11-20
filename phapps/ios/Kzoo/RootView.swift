import SwiftUI

/// Tab shell. Members get their tabs; an Admin tab appears only when the server says this person is an admin. 
struct RootView: View {
    @EnvironmentObject var session: Session
    var body: some View {
        TabView {
            HomeView().tabItem { Label("Home", systemImage: "house") }
            InboxView().tabItem { Label("Inbox", systemImage: "tray") }
            DirectoryView().tabItem { Label("Directory", systemImage: "person.2") }
            MoreView().tabItem { Label("More", systemImage: "ellipsis.circle") }
            if session.me?.admin == true { AdminView().tabItem { Label("Admin", systemImage: "gearshape") } }
        }
    }
}
