import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---- the PDF
const ascii = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/\t/g, "    ").replace(/[^\x0A\x20-\x7E\xA0-\xFF•]/g, "?");

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const para of ascii(text).split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      const t = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(t, size) <= width || !line) line = t; else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

export async function buildPdf(d: { title: string; body: string; tags: string[]; present: string[]; completed: Date }, signers: { name: string; email: string; signature: string; drawn: string; at: Date; ip: string; ua: string }[], bucket: string | null, contentHash: string, hideAudit = false) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const W = 612, H = 792, M = 54, TW = W - 2 * M;
  let page = pdf.addPage([W, H]), y = H - M;
  const room = (n: number) => { if (y - n < M) { page = pdf.addPage([W, H]); y = H - M; } };
  const para = (text: string, o: { f?: PDFFont; size?: number; gap?: number; color?: [number, number, number] } = {}) => {
    const f = o.f ?? font, size = o.size ?? 10.5;
    for (const l of wrap(text, f, size, TW)) { room(size * 1.4); y -= size * 1.4; page.drawText(l, { x: M, y, size, font: f, color: rgb(...(o.color ?? [0.1, 0.1, 0.1])) }); }
    y -= o.gap ?? 0;
  };
  para(d.title, { f: bold, size: 18, gap: 6 });
  const meta = [bucket && `Bucket: ${bucket}`, d.tags.length && `Tags: ${d.tags.join(", ")}`, d.present.length && `Present: ${d.present.join(", ")}`, `Completed: ${d.completed.toUTCString()}`].filter(Boolean) as string[];
  for (const m of meta) para(m, { size: 9, color: [0.4, 0.4, 0.4] });
  y -= 10;
  para(d.body, { gap: 14 });
  room(60); para("Signatures", { f: bold, size: 13, gap: 4 });
  for (const s of signers) {
    room(70);
    const top = y;
    if (s.drawn) { try { const img = await pdf.embedPng(Buffer.from(s.drawn.split(",")[1], "base64")), sc = Math.min(160 / img.width, 44 / img.height); page.drawImage(img, { x: M, y: y - 46, width: img.width * sc, height: img.height * sc }); } catch { /* bad image: the typed name below still counts */ } }
    else page.drawText(ascii(s.signature), { x: M, y: y - 30, size: 22, font: script });
    y = top - 52;
    page.drawLine({ start: { x: M, y }, end: { x: M + 220, y }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    para(`${s.name} (${s.email})`, { size: 9.5 });
    para(`Signed ${s.at.toUTCString()}`, { size: 8.5, color: [0.4, 0.4, 0.4], gap: 8 });
  }
  // Certificate page: who, when, from where, and a hash of exactly what they signed.
  if (!hideAudit) {
    page = pdf.addPage([W, H]); y = H - M;
    para("Signing certificate", { f: bold, size: 16, gap: 6 });
    para(`Document: ${d.title}`); para(`Content SHA-256: ${contentHash}`, { size: 9 }); para(`Completed: ${d.completed.toISOString()}`, { gap: 10 });
    for (const s of signers) para(`${s.name} <${s.email}>\nSigned ${s.at.toISOString()}\nIP ${s.ip || "unknown"}\n${s.ua || "unknown device"}`, { size: 9, gap: 8 });
    para("Each signer applied their signature electronically after reviewing the full text above and agreeing that it carries the same legal effect as a handwritten signature (U.S. ESIGN Act and UETA). This file is stored encrypted.", { size: 8.5, color: [0.4, 0.4, 0.4] });
  }
  return Buffer.from(await pdf.save());
}

/** An uploaded PDF with each recipient's filled fields drawn on it, plus the signing certificate page unless hidden. */
export type FieldRow = { page: number; x: number; y: number; w: number; h: number; type: string; value: string; signer: number; prefs?: { def?: string; align?: "l" | "c" | "r"; size?: number; cells?: number; stamp?: boolean } };
export async function buildFieldPdf(source: Buffer, fields: FieldRow[], signers: Map<number, { name: string; email: string; signature: string; drawn: string; initials: string; at: Date; ip: string; ua: string }>, d: { title: string; completed: Date; hideAudit: boolean }, hash: string) {
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true }), font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const pages = pdf.getPages(), ink = rgb(0.05, 0.05, 0.25);
  // Filled-in text uses a Unicode font (Latin, Greek, Cyrillic); anything it can't draw falls back to plain Helvetica.
  pdf.registerFontkit(fontkit);
  const uni = await pdf.embedFont(readFileSync(join(process.cwd(), "data/fonts/LiberationSans-Regular.ttf")), { subset: true }).catch(() => null);
  const text = (t: string): [PDFFont, string] => { try { if (uni) { uni.encodeText(t); return [uni, t]; } } catch { /* fall through */ } return [font, ascii(t)]; };
  const png = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>> | null>();
  const img = async (u: string) => { if (!png.has(u)) png.set(u, await pdf.embedPng(Buffer.from(u.split(",")[1], "base64")).catch(() => null)); return png.get(u)!; };
  const fit = (f: PDFFont, t: string, w: number, max: number) => { let s = max; while (s > 5 && f.widthOfTextAtSize(t, s) > w - 4) s -= 0.5; return s; };
  for (const f of fields) {
    const pg = pages[f.page - 1], s = signers.get(f.signer);
    if (!pg || !s) continue;
    const { width: PW, height: PH } = pg.getSize(), x = PW * f.x / 100, w = PW * f.w / 100, h = PH * f.h / 100, y = PH - PH * f.y / 100 - h;
    if (f.type === "signature" || f.type === "initials") {
      const drawn = f.type === "signature" ? s.drawn : "", im = drawn ? await img(drawn) : null, typed = ascii(f.type === "signature" ? s.signature : s.initials);
      if (im) { const sc = Math.min(w / im.width, h / im.height); pg.drawImage(im, { x, y, width: im.width * sc, height: im.height * sc }); }
      else pg.drawText(typed, { x: x + 2, y: y + h * 0.25, size: fit(script, typed, w, h * 0.7), font: script, color: ink });
      if (f.type === "signature" && f.prefs?.stamp) pg.drawText(ascii(`Signed by ${s.name} · ${s.at.toLocaleDateString("en-US", { timeZone: "America/Detroit" })} · IP ${s.ip || "?"}`).slice(0, 90), { x, y: y - 7, size: 6, font, color: rgb(0.4, 0.4, 0.4) });
    } else if (f.type === "checkbox") {
      if (f.value === "true") { const m = Math.min(w, h); pg.drawLine({ start: { x: x + m * .2, y: y + m * .2 }, end: { x: x + m * .8, y: y + m * .8 }, thickness: 1.5, color: ink }); pg.drawLine({ start: { x: x + m * .2, y: y + m * .8 }, end: { x: x + m * .8, y: y + m * .2 }, thickness: 1.5, color: ink }); }
    } else if (f.type === "image") {
      const im = f.value ? await (f.value.startsWith("data:image/png") ? pdf.embedPng : pdf.embedJpg).call(pdf, Buffer.from(f.value.split(",")[1], "base64")).catch(() => null) : null;
      if (im) { const sc = Math.min(w / im.width, h / im.height); pg.drawImage(im, { x, y, width: im.width * sc, height: im.height * sc }); }
    } else if (f.type === "cells") {
      const n = f.prefs?.cells ?? 10, cw = w / n, size = Math.min(h * 0.65, 12);
      for (let i = 0; i < n; i++) {
        pg.drawLine({ start: { x: x + i * cw + 1, y }, end: { x: x + (i + 1) * cw - 1, y }, thickness: 0.5, color: ink });
        const [cf, ch] = text(f.value[i] ?? ""); if (ch.trim()) pg.drawText(ch, { x: x + i * cw + (cw - cf.widthOfTextAtSize(ch, size)) / 2, y: y + h * 0.25, size, font: cf, color: ink });
      }
    } else {
      const [tf, t] = text(f.type === "date" ? s.at.toLocaleDateString("en-US", { timeZone: "America/Detroit" }) : f.type === "name" ? s.name : f.type === "email" ? s.email : f.value);
      const size = fit(tf, t, w, f.prefs?.size ?? Math.min(11, h * 0.6)), tw = tf.widthOfTextAtSize(t, size), al = f.prefs?.align;
      pg.drawText(t, { x: al === "c" ? x + (w - tw) / 2 : al === "r" ? x + w - tw - 2 : x + 2, y: y + h * 0.28, size, font: tf, color: ink });
    }
  }
  if (!d.hideAudit) {
    const W = 612, H = 792, M = 54, cp = pdf.addPage([W, H]); let cy = H - M;
    const put = (t: string, f = font, size = 9.5) => { for (const l of wrap(t, f, size, W - 2 * M)) { cy -= size * 1.5; cp.drawText(l, { x: M, y: cy, size, font: f, color: rgb(0.1, 0.1, 0.1) }); } cy -= 6; };
    put("Signing certificate", bold, 16); put(`Document: ${d.title}`); put(`Source SHA-256: ${hash}`, font, 9); put(`Completed: ${d.completed.toISOString()}`);
    for (const s of signers.values()) put(`${s.name} <${s.email}>\nSigned ${s.at.toISOString()}\nIP ${s.ip || "unknown"}\n${s.ua || "unknown device"}`, font, 9);
    put("Each signer applied their signature electronically after reviewing the document, with the same legal effect as a handwritten signature (U.S. ESIGN Act and UETA). This file is stored encrypted.", font, 8.5);
  }
  return Buffer.from(await pdf.save());
}

type Signer = { name: string; email: string; signature: string; initials?: string; drawn: string; at: Date; ip: string; ua: string };

/** The membership agreement in the paper form's layout: centered title, revision and page count top right, run-in headings, initials on every page, signature block. Pass no signer for a blank copy. */
export async function buildAgreementPdf(v: { title: string; revision: string; sections: { heading: string; body: string }[]; closing: string }, signer: Signer | null, hash = "", guardian: Signer | null = null) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const W = 612, H = 792, M = 54, TW = W - 2 * M, SZ = 10, LH = 13, ink = rgb(0.1, 0.1, 0.1);
  let page = pdf.addPage([W, H]), y = H - 96;
  const room = (n: number) => { if (y - n < 70) { page = pdf.addPage([W, H]); y = H - 96; } };
  const line = (t: string, x: number, f = font, size = SZ) => { room(LH); y -= LH; page.drawText(t, { x, y, size, font: f, color: ink }); };
  for (const sec of v.sections) {
    const head = ascii(sec.heading) + ": ", hw = bold.widthOfTextAtSize(head, SZ);
    const paras = ascii(sec.body).split("\n");
    paras.forEach((p, pi) => {
      const indent = /^(\u2022 |\([a-z]\) )/.test(p) ? 14 : 0, words = p.split(" ");
      let cur = "", first = pi === 0, avail = (first ? TW - hw - 2 : TW - indent);
      const flush = () => {
        room(LH); y -= LH;
        if (first) { page.drawText(head, { x: M, y, size: SZ, font: bold, color: ink }); page.drawLine({ start: { x: M, y: y - 1.5 }, end: { x: M + hw - 4, y: y - 1.5 }, thickness: 0.6, color: ink }); page.drawText(cur, { x: M + hw + 2, y, size: SZ, font, color: ink }); first = false; }
        else page.drawText(cur, { x: M + indent, y, size: SZ, font, color: ink });
        cur = ""; avail = TW - indent;
      };
      for (const w of words) { const t = cur ? cur + " " + w : w; if (font.widthOfTextAtSize(t, SZ) <= avail || !cur) cur = t; else { flush(); cur = w; } }
      flush();
    });
    y -= 7;
  }
  // Closing statement and signature block.
  room(210); y -= 6;
  for (const l of wrap(v.closing, bold, SZ, TW)) line(l, M, bold);
  y -= 14; line("Please sign below:", M);
  const block = async (sg: Signer | null, who: string) => { // a signature line (drawn or typed) with its date, then the printed name
    y -= 34;
    if (sg?.drawn) { try { const img = await pdf.embedPng(Buffer.from(sg.drawn.split(",")[1], "base64")), sc = Math.min(180 / img.width, 40 / img.height); page.drawImage(img, { x: M + 6, y: y - 2, width: img.width * sc, height: img.height * sc }); } catch { /* typed name below still counts */ } }
    else if (sg) page.drawText(ascii(sg.signature), { x: M + 6, y: y + 4, size: 20, font: script, color: ink });
    if (sg) page.drawText(sg.at.toLocaleDateString("en-US", { timeZone: "America/Detroit" }), { x: M + 340, y: y + 4, size: 11, font, color: ink });
    page.drawLine({ start: { x: M, y }, end: { x: M + 280, y }, thickness: 0.6, color: ink }); page.drawLine({ start: { x: M + 330, y }, end: { x: M + 450, y }, thickness: 0.6, color: ink });
    y -= 11; page.drawText(`Signature of ${who}`, { x: M, y, size: 8.5, font, color: ink }); page.drawText("Date", { x: M + 330, y, size: 8.5, font, color: ink });
    y -= 34; if (sg) page.drawText(ascii(sg.name), { x: M + 6, y: y + 4, size: 11, font, color: ink });
    page.drawLine({ start: { x: M, y }, end: { x: M + 280, y }, thickness: 0.6, color: ink });
    y -= 11; page.drawText(`Printed Name of ${who}`, { x: M, y, size: 8.5, font, color: ink });
  };
  await block(signer, guardian ? "Minor Guest" : "Member/Guest");
  if (guardian) { room(110); y -= 16; await block(guardian, "Parent/Legal Guardian"); }
  // Headers and footers once the page count is known.
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    const t = ascii(v.title), tw = bold.widthOfTextAtSize(t, 14);
    pg.drawText(t, { x: (W - tw) / 2, y: H - 54, size: 14, font: bold, color: ink });
    for (const [j, r] of [`REVISION ${ascii(v.revision)}`, `PAGE ${i + 1} of ${pages.length}`].entries()) pg.drawText(r, { x: W - M - bold.widthOfTextAtSize(r, 8.5), y: H - 70 - j * 11, size: 8.5, font: bold, color: ink });
    pg.drawText("Place your initials here", { x: M, y: 40, size: 10, font: bold, color: ink });
    pg.drawLine({ start: { x: M + 135, y: 38 }, end: { x: M + 215, y: 38 }, thickness: 0.6, color: ink });
    if (signer?.initials) pg.drawText(ascii(signer.initials), { x: M + 145, y: 41, size: 14, font: script, color: ink });
  });
  if (signer) {
    const cp = pdf.addPage([W, H]); let cy = H - M;
    const put = (t: string, f = font, size = 9.5) => { for (const l of wrap(t, f, size, TW)) { cy -= size * 1.5; cp.drawText(l, { x: M, y: cy, size, font: f, color: ink }); } cy -= 6; };
    put("Signing certificate", bold, 16); put(`Document: ${v.title}, revision ${v.revision}`); if (hash) put(`Content SHA-256: ${hash}`, font, 9);
    put(`${signer.name} <${signer.email}>\nSigned ${signer.at.toISOString()}\nInitials ${signer.initials || "n/a"}\nIP ${signer.ip || "unknown"}\n${signer.ua || "unknown device"}`, font, 9);
    if (guardian) put(`Parent/guardian: ${guardian.name} <${guardian.email}>\nSigned ${guardian.at.toISOString()}\nIP ${guardian.ip || "unknown"}\n${guardian.ua || "unknown device"}`, font, 9);
    put("Signed electronically after reviewing the full text, with the same legal effect as a handwritten signature (U.S. ESIGN Act and UETA). The initials shown at the foot of each page were applied by the signer. This file is stored encrypted.", font, 8.5);
  }
  return Buffer.from(await pdf.save());
}
