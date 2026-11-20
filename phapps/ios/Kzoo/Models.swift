import Foundation

// Shapes of the website's JSON (see web/app/api/mobile/*). Only the fields the app shows are listed; the rest is ignored.
struct Home: Decodable {
    struct Level: Decodable, Identifiable { let level: String; let since: Date; var id: String { level } }
    struct Tool: Decodable, Identifiable { let tool_id: Int; let name: String; let category: String; let expires_on: String?; let expired: Bool; var id: Int { tool_id } }
    struct Klass: Decodable, Identifiable {
        let id: Int; let title: String; let starts_at: Date; let location: String; let instructor: String; let capacity: Int; let signed: Int; let price: String; let mine: String?
    }
    struct Visit: Decodable, Identifiable { let first_name: String; let last_name: String; let at: Date; var id: Date { at } }
    let name: String; let levels: [Level]; let auths: [Tool]; let classes: [Klass]; let unreadMessages: Int; let visits: [Visit]
}

struct Inbox: Decodable {
    struct Convo: Decodable, Identifiable { let id: Int; let name: String; let body: String; let at: Date; let mine: Bool; let unread: Int }
    struct Notice: Decodable, Identifiable { let id: Int; let title: String; let body: String?; let at: Date; let read: Bool }
    let conversations: [Convo]; let notices: [Notice]
}

struct Thread: Decodable {
    struct Msg: Decodable, Identifiable { let id: Int; let mine: Bool; let body: String; let at: Date }
    let name: String; let canReply: Bool; let messages: [Msg]
}

struct Listing: Decodable, Identifiable {
    struct Skill: Decodable, Identifiable { let name: String; let level: String; var id: String { name } }
    let id: Int; let name: String; let bio: String; let skills: [Skill]
}

struct Account: Decodable {
    struct Profile: Decodable {
        let email: String?; let first_name: String?; let last_name: String?; let phone: String?; let address1: String?; let address2: String?
        let city: String?; let state: String?; let zip: String?; let gender: String?; let pronouns: String?
    }
    let profile: Profile; let contacts: [Contact]
}
struct Contact: Decodable, Identifiable {
    let id: Int; let first_name: String; let last_name: String; let phone: String; let relationship: String; let address: String?; let business_phone: String?
}

struct GuestBrief: Decodable, Identifiable {
    let id: Int; let first_name: String?; let last_name: String?; let ready: Bool; let next: String?; let last_visit: Date?
    var title: String { let n = [first_name, last_name].compactMap { $0 }.joined(separator: " "); return n.isEmpty ? "New guest" : n }
    /// What is still missing, in the guest's words.
    var status: String {
        if ready { return "Ready to check in" }
        switch next { case "details": return "Needs their details"; case "emergency": return "Needs an emergency contact"; case "agreement": return "Needs to sign the agreement"; case "photo": return "Needs an ID photo"; default: return "Not finished" }
    }
}
struct GuestList: Decodable { let guests: [GuestBrief] }
struct GuestOne: Decodable { let guest: GuestBrief }
struct CheckIn: Decodable { let already: Bool; let week: Int; let nag: Bool }

struct Chores: Decodable {
    struct Chore: Decodable, Identifiable {
        let id: Int; let name: String; let area: String; let task: String; let notes: String
        let due_at: Double?; let overdue_days: Double?; let last_done_at: Double?; let last_by: String?; let being_done_by: [String]
        var title: String { task.isEmpty ? name : task }
        /// "3 days over", "due today", "in 5 days", or "never due".
        var due: String {
            guard let d = overdue_days else { return "never due" }
            let n = Int(abs(d).rounded(.down))
            return d > 0 ? "\(n) day\(n == 1 ? "" : "s") over" : n == 0 ? "due today" : "in \(n) day\(n == 1 ? "" : "s")"
        }
    }
    struct Shift: Decodable, Identifiable { let id: Int; let chore: String; let started_at: Double }
    struct Hour: Decodable, Identifiable { let name: String; let hours: Double; let times: Int; var id: String { name } }
    let name: String; let chores: [Chore]; let mine: [Shift]; let hours: [Hour]
}

struct AdminCaps: Decodable { let email: String; let name: String; let sections: [String]; let write: [String] }

struct Person: Decodable, Identifiable {
    let id: Int; let name: String; let email: String; let approval: String; let disabled: Bool; let levels: [String]
}
struct PeopleResp: Decodable { let rows: [Person]; let total: Int }
struct PersonMore: Decodable {
    struct Level: Decodable { let level: String }
    struct Tool: Decodable, Identifiable { let tool_id: Int; let name: String; let expired: Bool; let expires_on: String?; var id: Int { tool_id } }
    let levels: [Level]; let auths: [Tool]
}

struct Applicant: Decodable, Identifiable { let id: Int; let name: String; let email: String; let applied_at: Date; let last_by_applicant: Bool }
struct ApplicantList: Decodable { let rows: [Applicant]; let counts: [String: Int] }
struct ApplicantDetail: Decodable {
    struct Event: Decodable, Identifiable { let id: Int; let actor: String; let by_applicant: Bool; let kind: String; let to_state: String?; let body: String; let at: Date }
    let id: Int; let name: String; let first_name: String; let last_name: String; let email: String; let approval: String; let events: [Event]
}

struct FormMsg: Decodable, Identifiable { let id: Int; let kind: String; let name: String; let email: String; let subject: String; let message: String; let status: String; let reason: String?; let created_at: Date }
struct FormList: Decodable { let messages: [FormMsg]; let counts: [String: Int] }
/// One line of a staff conversation (forms and tours share this shape): kind is "staff", "visitor" or "note".
struct ThreadLine: Decodable, Identifiable { let id: Int; let kind: String; let author: String; let body: String; let created_at: Date }

struct TourBooking: Decodable, Identifiable {
    let id: Int; let date: String; let start_time: String; let name: String; let email: String; let phone: String; let interest: String; let heard: String
    let status: String; let visitor_notes: String; let guide_name: String; let msgs: Int
}
