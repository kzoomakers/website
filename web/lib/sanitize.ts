import { load } from "cheerio";

// Blog posts are HTML shown to every visitor, and imports bring in HTML written elsewhere, so scripts and script-carrying attributes are removed.
// Allow-list for what stays: ordinary formatting, images, links, and YouTube/Vimeo embeds. Plain-text posts (not starting with "<") are escaped when shown, so they pass through.
const DROP = "script,style,object,embed,form,link,meta,base,noscript,template,applet,frame,frameset";
const URL_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction", "poster", "background", "data", "srcset"]);
const EMBED = /^https:\/\/(www\.)?(youtube(-nocookie)?\.com|player\.vimeo\.com)\//i;
const SAFE_URL = /^(https?:|mailto:|tel:)|^[^:/?#]*([/?#]|$)/i; // http(s)/mailto/tel, or a relative link (no colon before the first / ? #); javascript: and the like are refused
const IMG_DATA = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

export function cleanHtml(html: string): string {
  if (!/^\s*</.test(html)) return html;
  const $ = load(html, null, false);
  $(DROP).remove();
  $("iframe").each((_, el) => { if (!EMBED.test($(el).attr("src") ?? "")) $(el).remove(); });
  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    for (const [k, v] of Object.entries(el.attribs)) {
      const name = k.toLowerCase(), val = v.replace(/[\u0000- \u007f-\u009f]/g, ""); // browsers ignore control characters inside a scheme ("java\tscript:")
      if (name.startsWith("on") || name === "srcdoc" || (URL_ATTRS.has(name) && !SAFE_URL.test(val) && !(name === "src" && el.name === "img" && IMG_DATA.test(val)))) $(el).removeAttr(k);
    }
  });
  return $.html();
}
