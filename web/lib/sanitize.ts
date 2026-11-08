import { load } from "cheerio";

// Blog posts are HTML shown to every visitor, and imports bring in HTML written elsewhere, so only an allow-list survives:
// ordinary formatting, images, links, tables and YouTube/Vimeo embeds. Any other tag is unwrapped (its text stays), and dangerous ones are removed with their content.
// Plain-text posts (not starting with "<") are escaped when shown, so they pass through.
const TAGS = new Set("a abbr b blockquote br caption cite code col colgroup dd del div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i iframe img ins kbd li mark ol p picture pre q s samp small source span strike strong sub sup table tbody td tfoot th thead tr u ul video audio".split(" "));
const REMOVE = "script,style,svg,math,object,embed,form,input,button,select,textarea,link,meta,base,noscript,template,applet,frame,frameset,head,title";
const ATTRS = new Set(["href", "src", "alt", "title", "width", "height", "class", "colspan", "rowspan", "target", "rel", "loading", "allowfullscreen", "controls", "poster", "type", "dir", "lang", "id"]);
const URL_ATTRS = new Set(["href", "src", "poster"]);
const EMBED = /^https:\/\/(www\.)?(youtube(-nocookie)?\.com|player\.vimeo\.com)\//i;
const SAFE_URL = /^(https?:|mailto:|tel:)|^[^:/?#]*([/?#]|$)/i; // http(s)/mailto/tel, or a relative link (no colon before the first / ? #); javascript: and the like are refused
const IMG_DATA = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

export function cleanHtml(html: string): string {
  if (!/^\s*</.test(html)) return html;
  const $ = load(html, null, false);
  $(REMOVE).remove();
  $("iframe").each((_, el) => { if (!EMBED.test($(el).attr("src") ?? "")) $(el).remove(); });
  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    if (!TAGS.has(el.name)) { $(el).replaceWith($(el).contents()); return; }
    for (const [k, v] of Object.entries(el.attribs)) {
      const name = k.toLowerCase(), val = v.replace(/[\u0000- \u007f-\u009f]/g, ""); // browsers ignore control characters inside a scheme ("java\tscript:")
      const bad = !ATTRS.has(name) || (URL_ATTRS.has(name) && !SAFE_URL.test(val) && !(name === "src" && el.name === "img" && IMG_DATA.test(val)));
      if (bad) $(el).removeAttr(k);
    }
  });
  return $.html();
}
