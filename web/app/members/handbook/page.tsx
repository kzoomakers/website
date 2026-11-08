import MembersShell from "../shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Handbook | Kzoo Makers", robots: { index: false } };

// The public /handbook page, framed so members can check it any time without leaving the members area.
export default function HandbookPage() {
  return (
    <MembersShell title="Member handbook" path="/members/handbook">
      {() => <iframe src="/handbook" title="Membership handbook" style={{ width: "100%", height: "calc(100vh - 220px)", minHeight: 400, border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />}
    </MembersShell>
  );
}
