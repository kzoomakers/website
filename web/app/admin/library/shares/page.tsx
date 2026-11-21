import { gate } from "@/lib/guard";
import { sharesFor } from "@/lib/library/shares";
import Revoke from "./revoke";

export const dynamic = "force-dynamic";
export const metadata = { title: "Share links | Kzoo Makers admin" };

// Every share link across all documents (the links themselves are never stored, only who made them and how often they were opened).
export default async function SharesPage() {
  const level = await gate("library", "/admin/library/shares");
  const rows = await sharesFor(), now = Date.now();
  return (
    <div>
      <h1>Share links</h1>
      <p className="sub">Newest 200. Links and passcodes are shown only once, when made.</p>
      <table>
        <thead><tr><th>Document</th><th>Status</th><th>Access</th><th>Opened</th><th>By</th><th /></tr></thead>
        <tbody>{rows.map((s) => { const live = !s.revoked_at && new Date(s.expires_at).getTime() > now; return (
          <tr key={s.id}>
            <td>{s.title}</td>
            <td>{s.revoked_at ? "revoked" : live ? `expires ${new Date(s.expires_at).toLocaleDateString()}` : "expired"}</td>
            <td>{s.allow_download ? "download" : "view only"}</td>
            <td>{s.opens}×{s.last_open ? `, last ${new Date(s.last_open).toLocaleDateString()}` : ""}</td>
            <td>{s.created_by}</td>
            <td>{live && level === "write" && <Revoke id={s.id} />}</td>
          </tr>); })}</tbody>
      </table>
      {!rows.length && <p>No share links yet.</p>}
    </div>
  );
}
