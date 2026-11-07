import type { ReactNode } from "react";
import AdminBar from "./admin-bar";
import Frame from "./frame";
import Alerts from "./alerts";
import "./webmaster/webmaster.css";

export default function AdminRoot({ children }: { children: ReactNode }) {
  return <div className="adm adm-root"><Frame /><AdminBar /><Alerts />{children}</div>;
}
