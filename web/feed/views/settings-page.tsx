import { redirect } from "next/navigation";
import { currentFeedUser } from "../identity";
import { ABOUT_MAX, getSettings, HOMEPAGE_MAX } from "../models/settings";
import Shell from "./shell";

const Check = ({ name, label, on, hint, id = name }: { name: string; label: string; on: boolean; hint?: string; id?: string }) => (
  <>
    <label htmlFor={id} className="for_checkbox">{label}</label>
    <span><input type="checkbox" id={id} name={name} value="1" defaultChecked={on} aria-describedby={hint ? `${id}hint` : undefined} />{hint && <> <span className="hint" id={`${id}hint`}>{hint}</span></>}</span>
  </>
);
const Radio = ({ name, value, label, on }: { name: string; value: string; label: string; on: boolean }) => <label><input type="radio" name={name} value={value} defaultChecked={on} /> {label}</label>;
const Save = () => <input type="submit" value="Save Account Settings" />;

/** settings/index.html.erb. Left out for now: 2FA, GitHub/Mastodon/Pushover linking, avatar source, mailing-list mode and account deactivation. */
export default async function SettingsPage() {
  const me = await currentFeedUser().catch(() => null);
  if (!me) redirect("/login?return=/settings");
  const s = (await getSettings(me!.id))!, ext = s.kind === "external", b = s.bools;
  return (
    <Shell title="Settings" path="/settings" subnav={
      <>
        {s.username && <li className="push-right"><a href={`/~${s.username}`}>Public Profile</a></li>}
        <li><a href="/filters">Filtered Tags</a></li>
        <li id="logout"><form method="post" action="/auth/logout" style={{ display: "inline" }}><input type="hidden" name="csrf" value={me!.csrf} /><button type="submit" className="btn-link">Logout</button></form></li>
      </>}>
      <h1>Settings</h1>
      <section>
        <form method="post" action="/settings/save" id="edit_user">
          <input type="hidden" name="csrf" value={me!.csrf} />
          <section>
            <h2>Public Profile Information</h2>
            <div className="labelled_grid">
              <label htmlFor="username">Username</label>
              <div>
                {s.username ? <input id="username" name="username" required size={15} autoCapitalize="off" autoCorrect="off" maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_\-]{1,23}" defaultValue={s.username} aria-describedby="usernamehint" /> : <a href="/login/username">Choose a username</a>}
                <div className="hint" id="usernamehint">Format: <code>2 to 24 letters, digits, _ or -, starting with a letter or digit</code><br />Once a year at most. Creates a <a href="/moderations">modlog</a> entry like &quot;changed own username from &apos;{s.username ?? "Old"}&apos; to &apos;NewUsername&apos;&quot;</div>
              </div>
              <label htmlFor="email">Email</label>
              {ext ? <input id="email" name="email" type="email" required inputMode="email" autoCapitalize="off" maxLength={100} defaultValue={s.email} /> : <div>{s.email} <span className="hint">Managed on the main site</span></div>}
              <Check name="show_email" label="Show Email on profile" on={s.show_email} hint="Only shown to logged-in users" />
              <label htmlFor="homepage">Homepage</label>
              <input id="homepage" name="homepage" type="url" autoCapitalize="off" maxLength={HOMEPAGE_MAX} defaultValue={s.homepage} />
              <label htmlFor="about">About</label>
              <div><textarea id="about" name="about" maxLength={ABOUT_MAX} defaultValue={s.about} /><p className="hint">Markdown is supported.</p></div>
            </div>
            <Save />
          </section>
          <section>
            <h2>Security Settings</h2>
            {ext ? (
              <div className="labelled_grid">
                <label htmlFor="current_password">Current Password</label><input id="current_password" name="current_password" type="password" autoComplete="off" maxLength={200} />
                <label htmlFor="password">New Password</label><input id="password" name="password" type="password" autoComplete="new-password" maxLength={200} />
                <label htmlFor="password_confirmation">Confirm Password</label><input id="password_confirmation" name="password_confirmation" type="password" autoComplete="new-password" maxLength={200} />
                <span /><span className="hint">Needed to change your password or email address. A new address must be confirmed by a link we email to it.</span>
              </div>
            ) : <p>You sign in through the main site, so your password and email are managed there.</p>}
          </section>
          <p className="hint">Email and Pushover alerts are saved but not sent yet; the inbox works.</p>
          <section>
            <h2>Comment Reply Notification Settings</h2>
            <div className="labelled_grid">
              <Check name="email_replies" label="Receive E-mail" on={b.email_replies} />
              <Check name="pushover_replies" label="Receive Pushover Alert" on={b.pushover_replies} hint="Requires Pushover subscription" />
            </div>
          </section>
          <section>
            <h2>Comment Mention Notification Settings</h2>
            <div className="labelled_grid">
              <Check name="inbox_mentions" label="Show in Inbox" on={b.inbox_mentions} />
              <Check name="email_mentions" label="Receive E-mail" on={b.email_mentions} />
              <Check name="pushover_mentions" label="Receive Pushover Alert" on={b.pushover_mentions} hint="Requires Pushover subscription" />
            </div>
          </section>
          <section>
            <h2>Private Message Notification Settings</h2>
            <div className="labelled_grid">
              <Check name="email_messages" label="Receive E-mail" on={b.email_messages} />
              <label htmlFor="modmail" className="for_checkbox">Receive E-mail for ModMail</label>
              <span><input type="checkbox" id="modmail" disabled defaultChecked aria-describedby="notificationmodhint" /> <span className="hint" id="notificationmodhint">Notifications from Moderators are mandatory</span></span>
              <Check name="pushover_messages" label="Receive Pushover Alert" on={b.pushover_messages} hint="Requires Pushover subscription" />
            </div>
          </section>
          <section>
            <h2>Submitted Story Comment Settings</h2>
            <div className="labelled_grid"><Check name="show_submitted_story_threads" label="Show in Your Threads" on={b.show_submitted_story_threads} /></div>
          </section>
          <section>
            <h2>Miscellaneous Settings</h2>
            <fieldset className="radio-group-container grid-fieldset"><legend>Color Scheme</legend><div className="radio-group grid-fieldset">
              <Radio name="prefers_color_scheme" value="system" label="System" on={s.scheme === "system"} /><Radio name="prefers_color_scheme" value="light" label="Light" on={s.scheme === "light"} /><Radio name="prefers_color_scheme" value="dark" label="Dark" on={s.scheme === "dark"} />
            </div></fieldset>
            <fieldset className="radio-group-container grid-fieldset"><legend>Contrast</legend><div className="radio-group">
              <Radio name="prefers_contrast" value="system" label="System" on={s.contrast === "system"} /><Radio name="prefers_contrast" value="normal" label="Normal" on={s.contrast === "normal"} /><Radio name="prefers_contrast" value="high" label="High" on={s.contrast === "high"} />
            </div></fieldset>
            <div className="labelled_grid">
              <Check name="show_story_previews" label="Show Story Previews" on={b.show_story_previews} />
              <Check name="show_avatars" label="Show User Avatars" on={b.show_avatars} />
            </div>
            <br /><br /><Save />
          </section>
        </form>
      </section>
      <section><h2 id="invite">Invite a New User</h2><p><a href="/invitations">Send and track invitations</a></p></section>
      {ext && (
        <section>
          <form method="post" action="/settings/deactivate" id="deactivate_user">
            <input type="hidden" name="csrf" value={me!.csrf} />
            <h2>Deactivate Account</h2>
            <p>To deactivate your account, verify your current password below.</p>
            <ul>
              <li>Your profile will show that you deactivated your account.</li>
              <li>You will not be able to log in. To come back, contact a moderator.</li>
              <li>Your username will remain reserved and will not be available for any other account.</li>
              <li>Your private messages will be deleted (recipients will keep their copies of messages).</li>
              <li>Your submitted stories will not be deleted.</li>
              <li>Your comments with negative scores will be deleted, and you can check "disown" below if you want all of your stories and comments to list <a href="/~inactive-user">inactive-user</a> instead of your username.</li>
            </ul>
            <div className="labelled_grid">
              <label htmlFor="deactivate_password">Verify Password</label><input id="deactivate_password" name="password" type="password" required autoComplete="off" maxLength={200} />
              <label htmlFor="i_am_sure" className="for_checkbox">I am sure</label><span><input id="i_am_sure" name="i_am_sure" type="checkbox" value="1" required /></span>
              <label htmlFor="disown" className="for_checkbox">Disown stories/comments</label><span><input id="disown" name="disown" type="checkbox" value="1" aria-describedby="disownhint" /> <span className="hint" id="disownhint">(optional)</span></span>
            </div>
            <input type="submit" value="Yes, Deactivate My Account" className="deletion" />
          </form>
        </section>
      )}
    </Shell>
  );
}
