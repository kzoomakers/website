import type { Config } from "@puckeditor/core";
import ParentPicker from "@/components/parent-picker";
import { ImageInput } from "@/components/image-field";
import { GuidedPage } from "@/components/guided";
import { ContactForm } from "@/components/contact-form";
import ChipAnimation from "@/components/chip-animation";
import { Navbar, Footer, Counters, ThemeCss } from "@/components/chrome";

// Markup below mirrors the legacy HTML class-for-class so css/style.css applies unchanged.
const url = (h = "") => (/^(https?:|#|\/|mailto:)/.test(h) ? h : "/" + h);
const paras = (t = "") => t.split(/\n\s*\n/).filter(Boolean);
const lines = (t = "") => t.split("\n").flatMap((l, i) => (i ? [<br key={i} />, l] : [l]));
const img = (label: string) => ({ type: "custom" as const, label, render: ({ value, onChange }: any) => <ImageInput value={value} onChange={onChange} /> });
const buttons = { type: "array" as const, arrayFields: { label: { type: "text" as const }, href: { type: "text" as const } }, getItemSummary: (i: any) => i.label };

function Buttons({ items }: { items?: { label: string; href: string }[] }) {
  return <>{items?.map((b, i) => <span key={i}><a href={url(b.href)} className="btn btn-main mt-3">{b.label}</a> </span>)}</>;
}

function SectionTitle({ title, text }: { title: string; text?: string }) {
  return (
    <div className="row justify-content-center">
      <div className="col-xl-6 col-lg-8">
        <div className="title text-center">
          <h2>{title}</h2>
          {text && <p>{text}</p>}
          <div className="border" />
        </div>
      </div>
    </div>
  );
}

export type Props = {
  PageHeader: { title: string; tag: "h1" | "h2"; crumb: string; subtitle: string; subtitleTag: "h5" | "p"; trail: { label: string; href: string }[] };
  HtmlSection: { html: string };
  BoardMembers: {};
  LatestPosts: {};
  SiteMap: {};
  Guided: { kind: string; part?: string };
  ContactForm: { kind: "contact" | "board"; heading: string };
  TwoColumnText: { heading: string; body: string; buttons: { label: string; href: string }[]; image: string; imageAlt: string };
  VideoEmbed: { title: string; youtubeUrl: string; height: number };
  Statement: { text: string };
  Gallery: { title: string; text: string; images: { src: string; alt: string }[] };
  ImageCta: { heading: string; text: string; buttonLabel: string; buttonHref: string; bgImage: string };
  Counters: {};
  ChipAnimation: { label: string };
  CallToAction: { heading: string; text: string; buttons: { label: string; href: string }[] };
};

export type RootProps = { parent: string; title: string; description: string; bare: boolean; inline: { code: string }[]; bodyClass: string; refresh: string; css: string; styles: { href: string }[]; scripts: { src: string }[] };

export const config: Config<Props, RootProps> = {
  root: {
    fields: {
      parent: { type: "custom", label: "Where in the sitemap (only for pages not in the menu)", render: ({ value, onChange }: any) => <ParentPicker value={value} onChange={onChange} /> },
      title: { type: "text" }, description: { type: "textarea" },
      bare: { type: "radio", label: "Standalone page (no site header/footer/legacy scripts)", options: [{ label: "No", value: false }, { label: "Yes", value: true }] },
      inline: { type: "array", label: "Page scripts (advanced; run after the page loads)", arrayFields: { code: { type: "textarea" } }, getItemSummary: (i: any) => (i.code || "").slice(0, 40) },
      bodyClass: { type: "text", label: "Body class (advanced)" },
      refresh: { type: "text", label: "Auto-redirect, e.g. 3;url=https://example.com (blank = none)" },
      css: { type: "textarea", label: "Page CSS (advanced)" },
      styles: { type: "array", label: "Extra stylesheets", arrayFields: { href: { type: "text" } }, getItemSummary: (i: any) => i.href },
      scripts: { type: "array", label: "Extra scripts (advanced)", arrayFields: { src: { type: "text" } }, getItemSummary: (i: any) => i.src },
    },
    defaultProps: { parent: "", title: "Kzoo Makers", description: "", bare: false, inline: [], bodyClass: "", refresh: "", css: "", styles: [], scripts: [] },
    render: ({ children, css, styles, bare, puck }) => bare ? (
      <>{css && <style dangerouslySetInnerHTML={{ __html: css }} />}{children}</>
    ) : (
      <>
        <ThemeCss />
        {styles?.map((s) => <link key={s.href} rel="stylesheet" href={s.href} />)}
        {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
        <Navbar menu={(puck?.metadata?.menu as any) ?? []} />
        {children}
        <Footer />
      </>
    ),
  },
  components: {
    PageHeader: {
      fields: { title: { type: "text" }, crumb: { type: "text", label: "Breadcrumb text (defaults to title)" },
        subtitle: { type: "text", label: "Subtitle (optional)" },
        subtitleTag: { type: "radio", label: "Subtitle style", options: [{ label: "Heading (h5)", value: "h5" }, { label: "Light paragraph", value: "p" }] },
        trail: { type: "array", label: "Breadcrumb links between Home and this page", arrayFields: { label: { type: "text" }, href: { type: "text" } }, getItemSummary: (i: any) => i.label }, tag: { type: "radio", label: "Heading level", options: [{ label: "H1", value: "h1" }, { label: "H2", value: "h2" }] } },
      defaultProps: { title: "Page title", crumb: "", subtitle: "", subtitleTag: "h5", trail: [], tag: "h1" },
      render: ({ title, crumb, subtitle, subtitleTag, trail, tag }) => {
        const T = tag || "h2";
        return (
        <section className="single-page-header">
          <div className="container"><div className="row"><div className="col-md-12">
            <T>{title}</T>
            {subtitle && (subtitleTag === "p" ? <p className="text-light">{subtitle}</p> : <h5>{subtitle}</h5>)}
            <ol className="breadcrumb header-bradcrumb justify-content-center">
              <li className="breadcrumb-item"><a href="/" className="text-white">Home</a></li>
              {trail?.map((t, i) => <li key={i} className="breadcrumb-item"><a href={url(t.href)} className="text-white">{t.label}</a></li>)}
              <li className="breadcrumb-item active" aria-current="page">{crumb || title}</li>
            </ol>
          </div></div></div>
        </section>
        );
      },
    },
    // Escape hatch for migrated pages: raw section markup, edited as HTML. Promote to real components over time.
    // Trusted input only: editors are authenticated admins (Phase 2); never feed it user-submitted content.
    ChipAnimation: {
      fields: { label: { type: "text", label: "Chip text" } },
      defaultProps: { label: "KZOO" },
      render: ({ label }) => <ChipAnimation label={label} />,
    },
    HtmlSection: {
      fields: { html: { type: "textarea", label: "HTML" } },
      defaultProps: { html: "<section class=\"section\"><div class=\"container\"><p>New section</p></div></section>" },
      render: ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
    },
    // Generated from the menu + pages (page metadata); not editable.
    SiteMap: {
      render: ({ puck }) => {
        const tree: any[] = (puck?.metadata?.sitemap as any) ?? [];
        const list = (ns: any[]): React.ReactNode => (
          <ul className="list-unstyled" style={{ paddingLeft: 0 }}>
            {ns.map((n, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {n.slug ? <a href={n.slug === "index" ? "/" : "/" + n.slug}>{n.label}</a> : <strong>{n.label}</strong>}
                {n.children.length > 0 && <div style={{ marginLeft: 18 }}>{list(n.children)}</div>}
              </li>
            ))}
          </ul>
        );
        return <section className="section"><div className="container">{list(tree)}</div></section>;
      },
    },
    // The newest published blog posts (page metadata), so the homepage stays in step with /blog.
    LatestPosts: {
      render: ({ puck }) => {
        const posts: any[] = (puck?.metadata?.posts as any[]) ?? [];
        return (
          <section className="blog" id="blog"><div className="container">
            <div className="row justify-content-center"><div className="col-xl-6 col-lg-8"><div className="title text-center">
              <h2>Latest <span className="color">News</span></h2><div className="border" /><p>Stay updated with our latest projects and community events</p>
            </div></div></div>
            <div className="row">
              {posts.map((p) => (
                <article className="col-lg-4 col-md-6 mb-4" key={p.slug}><div className="post-item">
                  {p.image && <div className="media-wrapper"><img loading="lazy" src={p.image} alt="" className="img-fluid" /></div>}
                  <div className="content">
                    <p className="post-date"><small>{new Date(p.date).toLocaleDateString("en-US", { dateStyle: "long" })}</small></p>
                    <h3><a href={`/blog/${p.slug}`}>{p.title}</a></h3>
                    <p>{p.excerpt}</p>
                    <a className="btn btn-main" href={`/blog/${p.slug}`}>Read more</a>
                  </div>
                </div></article>
              ))}
              {!posts.length && <div className="col-12 text-center"><p>No posts yet. Check back soon!</p></div>}
            </div>
            <div className="row mt-4"><div className="col-12 text-center"><a href="/blog" className="btn btn-main">View All Posts</a></div></div>
          </div></section>
        );
      },
    },
    // Content comes from the Board admin screen (page metadata), not from the editor.
    BoardMembers: {
      render: ({ puck }) => {
        const b: any = puck?.metadata?.board;
        return !b ? <></> : (
          <section className="team" id="team"><div className="container">
            <SectionTitle title={b.title} text={b.intro} />
            <div className="row">
              {b.members.map((m: any, i: number) => (
                <div className="col-lg-4 col-md-6" key={i}><div className="team-member text-center">
                  <div className="member-photo">{m.photo && <img loading="lazy" className="img-fluid" src={url(m.photo)} alt={m.name} />}</div>
                  <div className="member-content"><h3>{m.name}</h3><span>{m.role}</span>{paras(m.bio).map((t, j) => <p key={j}>{t}</p>)}</div>
                </div></div>
              ))}
            </div>
          </div></section>
        );
      },
    },
    // Content comes from the Guided admin screens (page metadata), not from the editor.
    Guided: {
      fields: { kind: { type: "text" }, part: { type: "text" } },
      defaultProps: { kind: "team", part: "" },
      render: ({ kind, part, puck }) => <GuidedPage kind={kind} part={part} data={(puck?.metadata?.guided as any)?.[kind]} />,
    },
    ContactForm: {
      fields: { kind: { type: "radio", options: [{ label: "General (contact@)", value: "contact" }, { label: "Board (board@)", value: "board" }] }, heading: { type: "text", label: "Heading (blank = default)" } },
      defaultProps: { kind: "contact", heading: "" },
      render: ({ kind, heading }) => <ContactForm kind={kind} heading={heading} />,
    },
    TwoColumnText: {
      fields: {
        heading: { type: "text" },
        body: { type: "textarea", label: "Body (blank line = new paragraph)" },
        buttons,
        image: img("Image"),
        imageAlt: { type: "text" },
      },
      defaultProps: { heading: "Heading", body: "Text", buttons: [], image: "", imageAlt: "" },
      render: ({ heading, body, buttons, image, imageAlt }) => (
        <section className="about-shot-info section-sm">
          <div className="container"><div className="row">
            <div className="col-lg-6 mt-20">
              <h2 className="mb-3">{heading}</h2>
              {paras(body).map((p, i) => <p key={i}>{p}</p>)}
              <Buttons items={buttons} />
            </div>
            <div className="col-lg-6 mt-4 mt-lg-0">
              {image && <img loading="lazy" className="img-fluid" src={url(image)} alt={imageAlt} />}
            </div>
          </div></div>
        </section>
      ),
    },
    VideoEmbed: {
      fields: { title: { type: "text" }, youtubeUrl: { type: "text", label: "YouTube embed URL" }, height: { type: "number" } },
      defaultProps: { title: "Video", youtubeUrl: "https://www.youtube.com/embed/", height: 360 },
      render: ({ title, youtubeUrl, height }) => (
        <section className="promo-video section-sm">
          <div className="container">
            <SectionTitle title={title} />
            <div className="row"><div className="col-md-8 mx-auto">
              <iframe src={youtubeUrl} width="100%" height={height} frameBorder={0}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div></div>
          </div>
        </section>
      ),
    },
    Statement: {
      fields: { text: { type: "textarea", label: "Text (newline = line break)" } },
      defaultProps: { text: "A statement" },
      render: ({ text }) => (
        <section className="call-to-action-2 section">
          <div className="container"><div className="row"><div className="col-md-12 text-center">
            <h2>{lines(text)}</h2>
          </div></div></div>
        </section>
      ),
    },
    Gallery: {
      fields: {
        title: { type: "text" }, text: { type: "textarea" },
        images: { type: "array", arrayFields: { src: img("Image"), alt: { type: "text" } }, getItemSummary: (i: any) => i.src },
      },
      defaultProps: { title: "Gallery", text: "", images: [] },
      render: ({ title, text, images }) => (
        <section className="section gallery">
          <div className="container-fluid">
            <SectionTitle title={title} text={text} />
            <div className="row"><div className="col-md-12">
              {/* slick (legacy script.js) turns .company-gallery into a carousel on the public page */}
              <div className="company-gallery">
                {images.map((im, i) => <img key={i} loading="lazy" src={url(im.src)} alt={im.alt} />)}
              </div>
            </div></div>
          </div>
        </section>
      ),
    },
    ImageCta: {
      fields: { heading: { type: "text" }, text: { type: "textarea" }, buttonLabel: { type: "text" }, buttonHref: { type: "text" }, bgImage: img("Background image") },
      defaultProps: { heading: "Heading", text: "", buttonLabel: "Go", buttonHref: "/", bgImage: "" },
      render: ({ heading, text, buttonLabel, buttonHref, bgImage }) => (
        <section className="call-to-action-board section"
          style={{ backgroundImage: bgImage ? `url('${url(bgImage)}')` : undefined, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundAttachment: "scroll", padding: "100px 0" }}>
          <div className="container"><div className="row justify-content-center">
            <div className="col-xl-8 col-lg-10 text-center">
              <div style={{ backgroundColor: "rgba(0, 0, 0, 0.7)", padding: 30, borderRadius: 10 }}>
                <h2 style={{ color: "white" }}>{heading}</h2>
                <p style={{ color: "white" }}>{text}</p>
                <a href={url(buttonHref)} className="btn btn-main mt-3">{buttonLabel}</a>
              </div>
            </div>
          </div></div>
        </section>
      ),
    },
    Counters: { render: () => <Counters /> },
    CallToAction: {
      fields: { heading: { type: "text" }, text: { type: "textarea" }, buttons },
      defaultProps: { heading: "Heading", text: "", buttons: [] },
      render: ({ heading, text, buttons }) => (
        <section className="call-to-action section">
          <div className="container"><div className="row justify-content-center">
            <div className="col-xl-6 col-lg-8 text-center">
              <h2>{heading}</h2>
              <p>{text}</p>
              {buttons?.map((b, i) => <span key={i}><a href={url(b.href)} className="btn btn-main">{b.label}</a> </span>)}
            </div>
          </div></div>
        </section>
      ),
    },
  },
};
