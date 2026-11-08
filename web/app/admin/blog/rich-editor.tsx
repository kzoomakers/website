"use client";
import { useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { promptDialog } from "@/components/dialog";
import { MediaPicker } from "./media-picker";

// Bodies written before the rich editor are plain text with "## " headings; wrap them so they open as HTML.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
export const toHtml = (b: string) => (/^\s*</.test(b) || !b.trim() ? b : b.split(/\n\s*\n/).filter((x) => x.trim()).map((x) => (x.startsWith("## ") ? `<h2>${esc(x.slice(3))}</h2>` : `<p>${esc(x.trim())}</p>`)).join(""));

export default function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [lib, setLib] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), Image],
    content: toHtml(value),
    immediatelyRender: false, // Next renders client components on the server first
    editorProps: { attributes: { "aria-label": "Body", style: "min-height:320px;padding:10px;outline:0" } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });
  const on = useEditorState({ editor, selector: ({ editor: e }) => e && ["bold", "italic", "underline", "strike", "bulletList", "orderedList", "blockquote", "codeBlock", "link"].filter((n) => e.isActive(n)).concat([1, 2, 3].filter((l) => e.isActive("heading", { level: l })).map((l) => "h" + l)).join(" ") }) ?? "";
  if (!editor) return null;
  const c = () => editor.chain().focus();
  const link = async () => {
    const url = await promptDialog("Link address (blank removes the link):", editor.getAttributes("link").href ?? "https://");
    if (url === null) return;
    url.trim() && /^(https?:\/\/|\/|mailto:)/.test(url.trim()) ? c().extendMarkRange("link").setLink({ href: url.trim() }).run() : c().unsetLink().run();
  };
  const B = (label: string, active: string, run: () => void, title = label) =>
    <button type="button" title={title} aria-pressed={on.split(" ").includes(active)} onClick={run} style={on.split(" ").includes(active) ? { background: "#dbe6ff" } : undefined}>{label}</button>;
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="bar" style={{ padding: 8, margin: 0, borderBottom: "1px solid var(--line)" }}>
        {B("B", "bold", () => c().toggleBold().run(), "Bold")}{B("I", "italic", () => c().toggleItalic().run(), "Italic")}{B("U", "underline", () => c().toggleUnderline().run(), "Underline")}{B("S", "strike", () => c().toggleStrike().run(), "Strikethrough")}
        {B("H2", "h2", () => c().toggleHeading({ level: 2 }).run())}{B("H3", "h3", () => c().toggleHeading({ level: 3 }).run())}
        {B("• List", "bulletList", () => c().toggleBulletList().run())}{B("1. List", "orderedList", () => c().toggleOrderedList().run())}
        {B("“ Quote", "blockquote", () => c().toggleBlockquote().run())}{B("</>", "codeBlock", () => c().toggleCodeBlock().run(), "Code block")}
        {B("Link", "link", link)}
        <button type="button" onClick={() => setLib(true)}>Image</button>
        <button type="button" onClick={() => c().setHorizontalRule().run()}>—</button>
        <button type="button" onClick={() => c().undo().run()}>↶</button><button type="button" onClick={() => c().redo().run()}>↷</button>
      </div>
      <div className="prose-body"><EditorContent editor={editor} /></div>
      {lib && <MediaPicker onClose={() => setLib(false)} onPick={(src, alt) => { c().setImage({ src, alt }).run(); setLib(false); }} />}
    </div>
  );
}
