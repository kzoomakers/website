"use client";
import { useState } from "react";
import { useGetPuck } from "@puckeditor/core";
import { alertDialog, confirmDialog } from "@/components/dialog";
import { pageText } from "@/lib/aiseo";

/** Editor button: asks the AI for a description, summary and FAQs, and puts them in the fields below for review. Nothing is saved until Publish. */
export default function AiSuggest() {
  const get = useGetPuck();
  const [busy, setBusy] = useState(false);
  async function go() {
    const { appState, dispatch } = get(), data: any = appState.data, root = data.root ?? {}, p = root.props ?? root;
    if ((p.description || p.aiSummary || p.aiFaqs?.length) && !await confirmDialog("This replaces the description, AI summary and questions on this page with new suggestions. You can still edit them before publishing. Continue?")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/webmaster/pages/seo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: p.title, text: pageText(data) }) });
      if (!r.ok) throw new Error(await r.text());
      const s = await r.json();
      dispatch({ type: "setData", data: { root: { ...root, props: { ...p, description: s.description || p.description, aiSummary: s.aiSummary || p.aiSummary, aiFaqs: s.aiFaqs.length ? s.aiFaqs : p.aiFaqs } } } });
    } catch (e: any) { await alertDialog(e.message); }
    setBusy(false);
  }
  return <div><button type="button" disabled={busy} onClick={go} style={{ padding: "8px 12px", cursor: "pointer" }}>{busy ? "Thinking…" : "Suggest with AI"}</button>
    <p style={{ fontSize: 12, margin: "6px 0 0" }}>Fills the description, AI summary and questions below from this page's text. Check them before publishing.</p></div>;
}
