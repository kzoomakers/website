// Child process: a PDF on stdin -> JSON { pages, text } on stdout (text capped). Runs apart from the web server with an empty environment so a hostile PDF can only hurt this process;
// the parent times it out and kills it. Scanned PDFs come back with empty text (the caller flags them "not searchable").
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_PAGES = 400, MAX_TEXT = 1_000_000;
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const doc = await getDocument({ data: new Uint8Array(Buffer.concat(chunks)), isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
let text = "";
for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES) && text.length < MAX_TEXT; i++) {
  const t = await (await doc.getPage(i)).getTextContent();
  text += t.items.map((x) => x.str ?? "").join(" ") + "\n";
}
let thumb = "";
try { // optional: without @napi-rs/canvas (or on a odd first page) the document just has no thumbnail
  const { createCanvas } = await import("@napi-rs/canvas");
  const page = await doc.getPage(1), v = page.getViewport({ scale: 240 / page.getViewport({ scale: 1 }).width }), canvas = createCanvas(Math.ceil(v.width), Math.ceil(v.height));
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: v, canvas }).promise;
  thumb = (await canvas.encode("webp", 70)).toString("base64");
} catch {}
process.stdout.write(JSON.stringify({ pages: doc.numPages, text: text.replace(/[ \t]+/g, " ").slice(0, MAX_TEXT), thumb }));
process.exit(0);
