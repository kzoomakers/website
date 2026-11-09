import MembersShell from "../shell";
import Link from "next/link";
import Printer from "./printer";
import "./book.css";
import { HandbookPrint } from "@/components/guided";
import { fillAddress } from "@/lib/hours";
import { getGuided, getHours, withRev } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Handbook | Kzoo Makers", robots: { index: false } };

// The public /handbook page, framed so members can check it any time without leaving the members area.
// Printing (button, Ctrl+P or a phone's print menu) outputs the plain HandbookPrint document, never the frame.
export default function HandbookPage() {
  return (
    <MembersShell title="Member handbook" path="/members/handbook">
      {async () => {
        const d = fillAddress(await withRev("handbook", await getGuided("handbook")), (await getHours()).contact.address);
        return (
          <div className="hbp-row">
            <div className="hbp-book">
              <span className="hbp-lea" />
              <div className="hbp-in"><iframe src="/handbook" title="Membership handbook" /></div>
              <Link href="/members" className="hbp-x" aria-label="Close the handbook and go back to Members">✕</Link>
            </div>
            <Printer />
            {d && <HandbookPrint d={d} />}
          </div>
        );
      }}
    </MembersShell>
  );
}
