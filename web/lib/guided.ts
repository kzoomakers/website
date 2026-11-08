// "Guided" pages: fixed layout, content edited through forms. One schema per page drives the admin form,
// server-side validation and (with data/guided/<slug>.json as the starting content) the stored data.
export type Field = {
  key: string; label: string;
  kind: "text" | "area" | "lines" | "image" | "color" | "select" | "list" | "needs"; // needs: [{description, type}] edited with the category/item manager
  of?: Field[];            // list: fields of each item
  item?: string;           // list: key shown as the item's heading
  thumb?: string;          // list: key of an image field; shows the list as a visual photo grid
  add?: string;            // list: noun on the "+ Add …" button
  when?: [string, string[]]; // only shown while the named sibling (or parent) field has one of these values
  pick?: boolean;          // select: show the options as big buttons
  group?: string;          // heading shown above this field in the form
  options?: string[];      // select; "value|Label shown" lets the label differ from the stored value
  hint?: string;
  avatar?: boolean;        // image: shrink the upload to a small square avatar
};

const t = (key: string, label: string, kind: Field["kind"] = "text", hint?: string): Field => ({ key, label, kind, hint });
const g = (group: string, f: Field): Field => ({ ...f, group });
const cta = (p: string, label: string): Field[] => [t(p + "Label", `${label} button text`), t(p + "Href", `${label} button link`)];

export type GuidedDef = { slug: string; label: string; icon: string; blurb: string; fields: Field[] };

export const GUIDED: GuidedDef[] = [
  { slug: "index", label: "Homepage", icon: "🏠", blurb: "The big picture carousel, the intro, the “What we offer” cards, how the makerspace works, and member reviews.", fields: [
    g("Picture carousel", { key: "slides", label: "Slides", kind: "list", item: "title", thumb: "image", add: "slide", of: [
      t("image", "Background picture", "image"), t("title", "Heading", "area", "Each new line becomes a line break"), t("text", "Text under the heading"),
      ...cta("button", "Slide"),
      { key: "typing", label: "Animated “We make with…” line", kind: "select", options: ["no", "yes"], hint: "Normally only on the first slide" },
    ] }),
    g("Animated words", { key: "words", label: "Words after “We make with”", kind: "list", item: "word", add: "word", of: [t("word", "Word")] }),
    g("What is a makerspace?", t("whatTitle", "Heading")), t("whatText", "Text", "area", "Blank line = new paragraph"), t("whatImage", "Picture", "image"), ...cta("what", "Intro"),
    g("What we offer", t("offerTitle", "Heading")), t("offerText", "Text under the heading"),
    { key: "cards", label: "Cards", kind: "list", item: "label", thumb: "image", add: "card", of: [t("image", "Picture", "image"), t("label", "Title"), t("href", "Link", "text", "e.g. /wood-shop")] },
    g("How our makerspace works", t("howTitle", "Heading")), t("howBullets", "Bullet points", "lines", "One per line; wrap words in **stars** for bold"), t("howImage", "Picture", "image"),
    ...cta("btn1", "First"), ...cta("btn2", "Second"),
    g("Member reviews", t("reviewsTitle", "Heading")), t("reviewsText", "Text under the heading"),
    { key: "reviews", label: "Reviews", kind: "list", item: "name", thumb: "photo", add: "review", of: [
      t("name", "Name"), t("role", "Role", "text", "e.g. Makerspace Member"), { ...t("photo", "Photo", "image", "Large photos are shrunk to a small round avatar automatically"), avatar: true }, t("text", "What they said", "area"),
    ] },
  ] },
  { slug: "team", label: "Team", icon: "🙌", blurb: "Intro, volunteers and the board banner.", fields: [
    t("introTitle", "Intro heading"), t("introText", "Intro text", "area"), t("image", "Intro image", "image"),
    t("body", "Body text", "area", "Blank line = new paragraph"), t("driveTitle", "List heading"), t("features", "List items", "lines", "One per line"),
    ...cta("button", "Intro"),
    t("volTitle", "Volunteers heading"), t("volIntro", "Volunteers intro", "area"),
    { key: "volunteers", label: "Volunteers", kind: "list", item: "name", of: [
      t("name", "Name"), t("title", "Role"), t("bio", "Bio", "area"), t("photo", "Photo", "image"),
      t("color", "Badge color", "color", "Leave blank for an open (“Needed”) position"),
    ] },
    t("seekTitle", "Join-us heading"), t("seekText", "Join-us text", "area"), ...cta("seek", "Join-us"),
    t("ctaTitle", "Board banner heading"), t("ctaText", "Board banner text", "area"), ...cta("cta", "Board banner"), t("ctaImage", "Board banner background", "image"),
  ] },
  { slug: "history", label: "History", icon: "📜", blurb: "Photo slideshow, history sections and tour sign-up.", fields: [
    t("heroTitle", "Hero heading"),
    { key: "slides", label: "Slideshow", kind: "list", item: "caption", thumb: "image", of: [t("image", "Photo", "image"), t("caption", "Caption"), t("alt", "Alt text")] },
    { key: "sections", label: "Sections", kind: "list", item: "title", of: [
      t("title", "Heading"), t("text", "Text", "area", "Blank line = new paragraph"), { key: "style", label: "Look", kind: "select", options: ["about-2", "service-2"] },
    ] },
    t("tagline", "Tagline", "area"),
    t("tourTitle", "Tour heading"), t("tourText", "Tour text", "area"), ...cta("tour", "Tour"), t("tourNote", "Tour small print"),
  ] },
  { slug: "pricing", label: "Pricing", icon: "💲", blurb: "Membership plans and sign-up banners.", fields: [
    t("tagline", "Top banner", "area"), t("title", "Heading"), t("intro", "Intro", "area"),
    { key: "plans", label: "Plans", kind: "list", item: "name", of: [
      t("name", "Plan name"), t("price", "Price (number)"), t("per", "Per"), t("normal", "Normal price label", "text", "Optional, e.g. Normally $45/m"), t("offer", "Offer badge", "text", "Optional"),
      t("blurb", "Short description", "area"), t("note", "Requirement note", "text", "Optional"),
      t("features", "Features", "lines", "One per line; wrap in **stars** for bold"), ...cta("button", "Plan"),
    ] },
    t("footnote", "Footnote"), t("footLabel", "Footnote link text"), t("footHref", "Footnote link"), t("footEnd", "Footnote ending"),
    t("ctaTitle", "Bottom banner heading"), t("ctaText", "Bottom banner text", "area"), ...cta("cta", "Bottom banner"),
  ] },
];

GUIDED.push({ slug: "handbook", label: "Handbook", icon: "📘", blurb: "Sections and rules. Numbering and the table of contents are automatic.", fields: [
  t("title", "Title"), t("intro", "Introduction", "area"),
  { key: "sections", label: "Sections", kind: "list", item: "title", of: [
    t("title", "Section title"),
    { key: "items", label: "Rules in this section", kind: "list", item: "title", of: [
      t("title", "Rule title"), t("text", "Text", "area", "Blank line = new paragraph; start lines with “- ” for bullets; **bold**; [link text](https://…)"),
    ] },
  ] },
  t("footer", "Footer"),
] });

export const guidedDef = (slug: string) => GUIDED.find((g) => g.slug === slug);

const build = (fields: Field[], v: any): any => {
  if (!v || typeof v !== "object") throw new Error("bad data");
  return Object.fromEntries(fields.map((f) => {
    const x = v[f.key];
    if (f.kind === "list") {
      if (!Array.isArray(x)) throw new Error("bad data");
      return [f.key, x.map((i) => build(f.of!, i))];
    }
    if (f.kind === "needs") {
      const ok = (i: any) => i && typeof i.description === "string" && typeof i.type === "string";
      if (!Array.isArray(x) || x.length > 5000 || !x.every(ok)) throw new Error("bad data");
      return [f.key, x.map((i) => ({ description: i.description, type: i.type }))];
    }
    if (typeof x !== "string") throw new Error("bad data");
    return [f.key, x];
  }));
};

/** Fills in fields added to the schema after content was saved (blank text, first option, empty list). */
export const withDefaults = (fields: Field[], v: any): any =>
  Object.fromEntries(fields.map((f) => {
    const x = v?.[f.key];
    return [f.key, f.kind === "needs" ? (Array.isArray(x) ? x : []) : f.kind === "list" ? (Array.isArray(x) ? x.map((i) => withDefaults(f.of!, i)) : []) : typeof x === "string" ? x : f.kind === "select" ? f.options![0].split("|")[0] : ""];
  }));

/** Only the schema's own fields survive; anything of the wrong type throws. */
export const cleanGuided = (slug: string, v: unknown) => {
  if (!v || typeof v !== "object") throw new Error("bad data");
  return build(guidedDef(slug)!.fields, withDefaults(guidedDef(slug)!.fields, v));
};


GUIDED.push(
  { slug: "about", label: "About", icon: "ℹ️", blurb: "Intro, video, photo gallery, board banner and sign-up banner. The numbers (members, tools…) update themselves.", fields: [
    g("Introduction", t("heading", "Heading")), t("body", "Text", "area", "Blank line = new paragraph"), t("image", "Picture", "image"), t("imageAlt", "Picture description", "text", "Read aloud to people who can't see it"),
    ...cta("btn1", "First"), ...cta("btn2", "Second"),
    g("Video", t("videoTitle", "Video heading")), t("videoUrl", "YouTube link", "text", "Use the “embed” link: https://www.youtube.com/embed/…"),
    g("Big statement", t("statement", "Statement", "area", "Each new line becomes a line break")),
    g("Photo gallery", t("galleryTitle", "Gallery heading")), t("galleryText", "Gallery text", "area"),
    { key: "images", label: "Photos", kind: "list", item: "alt", thumb: "src", of: [t("src", "Photo", "image"), t("alt", "Description", "text", "Short, e.g. “Members at the laser cutter”")] },
    g("Board banner", t("boardTitle", "Heading")), t("boardText", "Text", "area"), ...cta("board", "Banner"), t("boardImage", "Background photo", "image"),
    g("Sign-up banner", t("ctaTitle", "Heading")), t("ctaText", "Text", "area"), ...cta("cta1", "First"), ...cta("cta2", "Second"),
  ] },
  { slug: "contact", label: "Contact", icon: "✉️", blurb: "The contact cards and the map.", fields: [
    g("Contact cards", { key: "cards", label: "Cards", kind: "list", item: "title", of: [
      t("title", "Card title"), { key: "icon", label: "Icon", kind: "select", options: ["location", "people", "chatboxes", "email", "telephone"] },
      t("button", "Button text"), t("href", "Link", "text", "A web address, mailto:you@example.com or tel:+15551234567"),
      t("line1", "First line", "area"), t("line2", "Second line (italic)", "area"),
      { key: "hours", label: "Show opening hours", kind: "select", options: ["no", "yes"], hint: "Hours load automatically from the calendar" },
    ] }),
    g("Map", t("lat", "Latitude")), t("lng", "Longitude"), t("marker", "Map pin label"),
  ] },
);

GUIDED.push({ slug: "other-makerspaces", label: "Other makerspaces", icon: "🗺️", blurb: "Lists of makerspaces. Add, remove and reorder groups and the makerspaces in each.", fields: [
  t("title", "Heading"), t("intro", "Intro", "area"),
  { key: "groups", label: "Lists", kind: "list", item: "title", of: [
    t("title", "List heading"),
    { key: "spaces", label: "Makerspaces", kind: "list", item: "name", of: [t("city", "City"), t("name", "Makerspace"), t("url", "Web address", "text", "https://…")] },
  ] },
  t("note", "Small print", "area"),
] });

GUIDED.push({ slug: "laser-shop", label: "Laser shop", icon: "🔥", blurb: "Project photos at the top, then equipment, materials, safety and FAQ.", fields: [
  g("Photos at the top", t("galleryTitle", "Heading")), t("galleryText", "Text under the heading", "area"),
  { key: "slides", label: "Project photos", kind: "list", item: "caption", thumb: "image", of: [t("image", "Photo", "image"), t("caption", "Title shown under the photo"), t("alt", "Description", "text", "For people who can't see the photo")] },
  g("About the shop", t("detailsTitle", "Heading")), t("detailsIntro", "Intro", "area"),
  t("equipTitle", "Equipment heading"), t("equipment", "Equipment list", "lines", "One per line. Put **bold words** first, then “ - ” and the description"),
  t("materialsTitle", "Materials heading"), t("canTitle", "“Can” heading"), t("can", "Materials you can use", "lines", "One per line"),
  t("cannotTitle", "“Cannot” heading"), t("cannot", "Materials you can't use", "lines", "One per line"),
  g("Getting started", t("startTitle", "Heading")), t("startText", "Text", "area", "Blank line = new paragraph"),
  t("readyTitle", "Sign-up heading"), t("readyText", "Sign-up text", "area"),
  { key: "buttons", label: "Buttons", kind: "list", item: "label", of: [t("label", "Button text"), t("href", "Link", "text", "e.g. /pricing")] },
  g("Safety", t("safetyTitle", "Heading")),
  { key: "safety", label: "Safety points", kind: "list", item: "title", of: [{ key: "icon", label: "Icon", kind: "select", options: ["check", "people", "star"] }, t("title", "Title"), t("text", "Text", "area")] },
  g("Questions", t("faqTitle", "Heading")),
  { key: "faqs", label: "Questions and answers", kind: "list", item: "q", of: [t("q", "Question"), t("a", "Answer", "area")] },
] });

// Shared template for the "Explore Us" and "Learn More" pages: photos on top, then any number of sections the editor can add, reorder and restyle.
const LOOKS = ["Columns of text|📝 Text columns", "Icon cards|⭐ Icon cards", "Feature cards|🃏 Cards", "Highlight box|💡 Highlight box", "Stats|🔢 Big numbers", "Centered call-to-action|📣 Call to action", "Banner|🖼️ Banner"];
const ICONS = ["none|(none)", "check|✔ Check", "people|👥 People", "star|★ Star", "palette|🎨 Palette", "pencil|✏️ Pencil", "idea|💡 Idea", "laptop|💻 Laptop"];
const sec = (...l: string[]): Field["when"] => ["look", l];
const shopFields: Field[] = [
  g("Photos at the top", t("galleryTitle", "Heading", "text", "Optional")), t("galleryText", "Text under the heading", "area"),
  { key: "slides", label: "Project photos", kind: "list", item: "caption", thumb: "image", add: "photos", of: [t("image", "Photo", "image"), t("caption", "Title shown under the photo"), t("alt", "Description", "text", "For people who can't see the photo")] },
  g("Page sections", { key: "sections", label: "Sections", kind: "list", item: "title", add: "section", of: [
    { key: "look", label: "How should this section look?", kind: "select", options: LOOKS, pick: true },
    { key: "background", label: "Background", kind: "select", options: ["White", "Grey"], when: sec("Columns of text", "Icon cards", "Feature cards", "Highlight box", "Stats", "Centered call-to-action") },
    { key: "columns", label: "Blocks per row", kind: "select", options: ["1", "2", "3"], hint: "Side by side on computers; stacked on phones", when: sec("Columns of text", "Icon cards", "Feature cards", "Highlight box", "Stats") },
    t("title", "Section heading", "text", "Optional"), t("intro", "Text under the heading", "area"),
    { ...t("image", "Background photo", "image"), when: sec("Banner") },
    { key: "items", label: "Content blocks", kind: "list", item: "heading", add: "block", when: sec("Columns of text", "Icon cards", "Feature cards", "Highlight box", "Stats", "Centered call-to-action"), of: [
      { key: "icon", label: "Icon", kind: "select", options: ICONS, when: sec("Icon cards") },
      { ...t("emoji", "Emoji", "text", "Optional, e.g. 🔧"), when: sec("Feature cards") },
      t("heading", "Block heading", "text", "For big numbers: the number, e.g. $5"),
      { ...t("label", "Small label under the number"), when: sec("Stats") },
      t("text", "Text", "area", "Blank line = new paragraph; start lines with “- ” for bullets; **bold**; [link text](https://…)"),
      { ...t("linkLabel", "Button text", "text", "Optional"), when: sec("Feature cards") }, { ...t("linkHref", "Button link"), when: sec("Feature cards") },
    ] },
    { ...t("outro", "Closing sentence", "area"), when: sec("Highlight box") },
    { key: "buttons", label: "Buttons", kind: "list", item: "label", add: "button", of: [t("label", "Button text"), t("href", "Link", "text", "e.g. /pricing")] },
  ] }),
];
for (const [slug, label, icon] of [["wood-shop", "Wood shop", "🪵"], ["metal-shop", "Metal shop", "🔩"], ["3d-printing", "3D printing", "🖨️"], ["craft-room-kalamazoo", "Craft room", "🧵"], ["meeting-space", "Meeting space", "🤝"],
  ["what_is_a_makerspace", "Maker philosophy", "💭"], ["why-kzoo-makers", "Why join us", "🌟"]])
  GUIDED.push({ slug, label, icon, blurb: "Photos on top, then sections you can add, reorder and restyle.", fields: shopFields });

GUIDED.push({ slug: "how-to", label: "How-to guides", icon: "📚", blurb: "Categories on the left; the guides in each category appear on the right.", fields: [
  t("heroTitle", "Page heading"), t("heroText", "Text under the heading"), t("heroImage", "Heading background photo", "image"),
  g("Categories", { key: "categories", label: "Categories", kind: "list", item: "name", add: "category", of: [
    t("name", "Category name"),
    { key: "icon", label: "Icon", kind: "select", options: ["fa-hammer|🔨 Hammer", "fa-cog|⚙️ Gear", "fa-cube|🧊 Cube", "fa-print|🖨️ Printer", "fa-bolt|⚡ Bolt", "fa-wrench|🔧 Wrench", "fa-microchip|💾 Chip", "fa-book|📖 Book"], pick: true },
    { key: "articles", label: "Guides in this category", kind: "list", item: "title", add: "guide", of: [
      t("title", "Guide title"), t("url", "Page link", "text", "e.g. how-to-woodsaw-safety.html"),
      { key: "icon", label: "Icon", kind: "select", options: ["fa-book|📖 Book", "fa-triangle-exclamation|⚠️ Warning", "fa-shield-halved|🛡️ Shield", "fa-gears|⚙️ Gears", "fa-circle-notch|⭕ Ring", "fa-house|🏠 House", "fa-circle-xmark|❌ Cross", "fa-laser|🔦 Laser"] },
    ] },
  ] }),
] });

GUIDED.push({ slug: "tools-we-are-seeking-donations-kalamazoo", label: "Donate: tools we need", icon: "🧰", blurb: "The donation page text and the list of items we are looking for, sorted into categories.", fields: [
  g("Top of the page", t("heading", "Heading")), t("lead", "Intro", "area"),
  g("Why donate", t("whyTitle", "Heading")), t("whyIntro", "Intro", "area"), t("benefits", "Reasons", "lines", "One per line. Start with **bold words**, then the explanation"),
  g("How to donate", t("howTitle", "Heading")), t("howText", "Text", "area", "Blank line = new paragraph"), t("contactLabel", "Contact link text"), t("contactHref", "Contact link", "text", "e.g. /contact"),
  g("Items we need", t("needsTitle", "Heading")), t("needsText", "Text", "area"), t("statLabel", "Counter label", "text", "Shown under the number of items"),
  { key: "items", label: "Items and categories", kind: "needs" },
] });

/** One line per value (nested lists indented), so a diff shows exactly which text changed. Used by revision lists and the audit log. */
export const guidedLines = (fields: Field[], v: any, ind = ""): string[] =>
  fields.flatMap((f) => f.kind === "needs" ? [`${ind}${f.label}:`, ...(v[f.key] ?? []).map((i: any) => `${ind}  ${i.type}: ${i.description}`).sort()]
    : f.kind === "list" ? [`${ind}${f.label}:`, ...(v[f.key] ?? []).flatMap((i: any) => guidedLines(f.of!, i, ind + "  "))] : [`${ind}${f.label}: ${v[f.key]}`]);
