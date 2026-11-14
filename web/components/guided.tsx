// Renderers for the guided pages. Markup mirrors the legacy HTML class-for-class so css/style.css applies unchanged.
import type { CSSProperties } from "react";
import { Counters } from "./chrome";
import { DragCarousel } from "./drag-carousel";
import { GuideBrowser } from "./guide-browser";
import { DonationNeeds } from "./donation-needs";
import HandbookNotify from "./handbook-notify";
import { ReviewForm } from "./review-form";
import { DonationForm } from "./donation-form";
import { ContactForm } from "./contact-form";
import { SITE } from "@/lib/site";
import "./handbook-print.css";

const url = (h = "") => (/^(https?:|#|\/|mailto:|tel:)/.test(h) ? h : "/" + h);
const paras = (t = "") => t.split(/\n\s*\n/).filter(Boolean);
const rows = (t = "") => t.split("\n").map((l) => l.trim()).filter(Boolean);
const lines = (t = "") => t.split("\n").flatMap((l, i) => (i ? [<br key={i} />, l.trim()] : [l.trim()]));

function Title({ title, text, wrap = "col-xl-6 col-lg-8" }: { title: string; text?: string; wrap?: string }) {
  return (
    <div className="row justify-content-center"><div className={wrap}>
      <div className="title text-center"><h2>{title}</h2>{text && <p>{text}</p>}<div className="border" /></div>
    </div></div>
  );
}

function Team({ d }: { d: any }) {
  const photo: CSSProperties = { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" };
  return (
    <>
      <section className="about" id="about"><div className="container">
        <Title title={d.introTitle} text={d.introText} />
        <div className="row">
          <div className="col-lg-6 mb-5 mb-lg-0"><img loading="lazy" src={url(d.image)} className="img-fluid" alt="" /></div>
          <div className="col-lg-6">
            {paras(d.body).map((p, i) => <p key={i}>{p}</p>)}
            <h4>{d.driveTitle}</h4>
            <ul className="feature-list">{rows(d.features).map((f, i) => <li key={i}> <i className="tf-ion-android-checkmark-circle" /> {f}</li>)}</ul>
            <a href={url(d.buttonHref)} className="btn btn-main mt-20">{d.buttonLabel}</a>
          </div>
        </div>
      </div></section>
      <section className="volunteers" id="volunteers" style={{ padding: "60px 0" }}><div className="container">
        <Title title={d.volTitle} text={d.volIntro} />
        <div className="row">
          {d.volunteers.map((v: any, i: number) => (
            <div className="col-lg-2 col-md-4 col-sm-6 mb-4" key={i}><div className="team-member text-center">
              {v.color
                ? <div className="member-photo" style={{ width: "100%", paddingBottom: "100%", position: "relative", overflow: "hidden" }}><img loading="lazy" className="img-fluid" src={url(v.photo)} alt={v.name} style={photo} /></div>
                : <div className="member-photo"><img loading="lazy" className="img-fluid" src={url(v.photo)} alt={v.name} style={{ maxHeight: 200, objectFit: "cover" }} /></div>}
              <div className="member-content">
                <h5>{v.name}</h5>
                <span style={v.color ? { fontSize: "0.9em", backgroundColor: v.color, color: "#fff", padding: "4px 10px", borderRadius: 4, display: "inline-block" } : { fontSize: "0.9em" }}><b>{v.title}</b></span>
                <p style={{ fontSize: "0.85em" }}>{v.bio}</p>
              </div>
            </div></div>
          ))}
        </div>
        <div className="row justify-content-center mt-5"><div className="col-xl-8 col-lg-10">
          <div className="text-center" style={{ background: "#f8f9fa", padding: "40px 30px", borderRadius: 8 }}>
            <h3 style={{ marginBottom: 20 }}>{d.seekTitle}</h3>
            <p style={{ fontSize: "1.1em", marginBottom: 25 }}>{d.seekText}</p>
            <div><a href={url(d.seekHref)} className="btn btn-main">{d.seekLabel}</a></div>
          </div>
        </div></div>
      </div></section>
      <section className="call-to-action-board section" style={{ backgroundImage: `url('${url(d.ctaImage)}')`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundAttachment: "scroll", padding: "100px 0" }}><div className="container">
        <div className="row justify-content-center"><div className="col-xl-8 col-lg-10 text-center">
          <div style={{ backgroundColor: "rgba(0, 0, 0, 0.7)", padding: 30, borderRadius: 10 }}>
            <h2 style={{ color: "white" }}>{d.ctaTitle}</h2>
            <p style={{ color: "white" }}>{d.ctaText}</p>
            <a href={url(d.ctaHref)} className="btn btn-main mt-3">{d.ctaLabel}</a>
          </div>
        </div></div>
      </div></section>
    </>
  );
}

const arrow = (dir: "left" | "right") => (
  <svg width="16" height="16" fill="currentColor" className={`arrow-icon arrow-${dir}-circle`} viewBox="0 0 16 16">
    <path fillRule="evenodd" d={dir === "left"
      ? "M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8m15 0A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-4.5-.5a.5.5 0 0 1 0 1H5.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L5.707 7.5z"
      : "M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8m15 0A8 8 0 1 1 0 8a8 8 0 0 1 16 0M4.5 7.5a.5.5 0 0 0 0 1h5.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 1 0-.708.708L10.293 7.5z"} />
  </svg>
);

// The page's inline scripts (particles, slideshow) bind to these class names and ids.
function History({ d }: { d: any }) {
  return (
    <>
      <div className="canvas-container">
        <canvas id="canvas" />
        <div className="hero-text-overlay" style={{ top: 100, transform: "translate(-50%, 0)" }}><h1>{d.heroTitle}</h1></div>
        <div className="image-thumbnail-carousel" style={{ position: "absolute", bottom: 50, left: "50%", transform: "translateX(-50%)", zIndex: 20, pointerEvents: "auto" }}>
          <section className="image-display"><div className="screen" /></section>
          <div className="image-caption" style={{ textAlign: "center", color: "white", background: "rgba(0,0,0,0.8)", padding: "12px 20px", fontSize: 15, margin: "10px 0", borderRadius: 8, minHeight: 45, display: "flex", alignItems: "center", justifyContent: "center" }} />
          <section className="thumbnail-carousel">
            <button type="button" className="carousel__btn prev" aria-label="Previous slide">{arrow("left")}</button>
            <ul className="carousel__slider">
              {d.slides.map((s: any, i: number) => (
                <li className="carousel__slide" data-caption={s.caption} key={i}><div className="thumbnail"><img loading="lazy" src={url(s.image)} alt={s.alt} /></div></li>
              ))}
            </ul>
            <button type="button" className="carousel__btn next" aria-label="Next slide">{arrow("right")}</button>
          </section>
        </div>
      </div>
      {d.sections.map((s: any, i: number) => (
        <section className={`${s.style} section`} key={i}><div className="container">
          <Title title={s.title} wrap="col-lg-8" />
          <div className="row"><div className="col-md-12">{paras(s.text).map((p, j) => <p key={j}>{p}</p>)}</div></div>
        </div></section>
      ))}
      <section className="call-to-action-2 section"><div className="container"><div className="row"><div className="col-md-12 text-center"><h2>{lines(d.tagline)}</h2></div></div></div></section>
      <section className="wanna-tour section"><div className="container"><div className="row justify-content-center"><div className="col-xl-6 col-lg-8 text-center">
        <h2>{d.tourTitle}</h2><p>{lines(d.tourText)}</p><br />
        <a href={url(d.tourHref)} className="btn btn-main">{d.tourLabel}</a>
        {d.tourNote && <p><sub>{d.tourNote}</sub></p>}
      </div></div></div></section>
    </>
  );
}

const star = <sup style={{ fontSize: "2em", color: "#ff6b6b", fontWeight: "bold" }}>*</sup>;

// js/pricing-special.js rewrites .offer-badge text by date, so the markup keeps those classes.
function Pricing({ d }: { d: any }) {
  return (
    <>
      <section className="call-to-action-2 section" id="about" style={{ padding: "40px 0" }}><div className="container"><div className="row"><div className="col-md-12 text-center">
        <h2 id="about-heading" style={{ color: "white" }}>{lines(d.tagline)}</h2>
      </div></div></div></section>
      <section className="pricing-table" id="pricing"><div className="container">
        <div className="row justify-content-center align-items-center"><div className="col-xl-12 col-lg-12 col-md-12 text-center">
          <div className="title title-white"><h2>{d.title}</h2><p>{d.intro}</p><div className="border" /></div>
        </div></div>
        <div className="row">
          {d.plans.map((p: any, i: number) => (
            <div className="col-lg-4 col-md-6" key={i}><div className="pricing-item">
              <div className="price-title">
                <h3>{p.name}</h3>
                {p.normal && <span className="normal-price-label">{p.normal}</span>}
                {p.offer && <span className="offer-badge">{p.offer}</span>}
                <strong className="value">${p.price}<sub>{p.per}</sub></strong>{star}
                <p>{lines(p.blurb)}{p.note && <><br /><span className="badge badge-warning" style={{ fontSize: "0.9em", marginTop: 5 }}>{p.note}</span></>}</p>
              </div>
              <ul>{rows(p.features).map((f, j) => {
                const b = /^\*\*(.*)\*\*$/.exec(f);
                return <li key={j}><i className="tf-ion-ios-arrow-forward" />{b ? <strong> {b[1]}</strong> : ` ${f}`}</li>;
              })}</ul>
              <a className="btn btn-main" href={url(p.buttonHref)}>{p.buttonLabel}</a>
            </div></div>
          ))}
          <div className="col-12"><p className="text-center px-3 terms-text" style={{ marginTop: 30 }}>
            <span style={{ fontSize: "2em", color: "#ff6b6b", fontWeight: "bold" }}>*</span> {d.footnote} <a href={url(d.footHref)}>{d.footLabel}</a> {d.footEnd}
          </p></div>
        </div>
      </div></section>
      <section className="call-to-action-wormhole section"><div className="container"><div className="row"><div className="col-md-12 text-center">
        <h2>{d.ctaTitle}</h2><p>{d.ctaText}</p><a href={url(d.ctaHref)} className="btn btn-main">{d.ctaLabel}</a>
      </div></div></div></section>
    </>
  );
}

// **bold** and [text](link) inside rule text; links are limited to safe schemes.
function inline(t: string) {
  return t.split(/(\*\*.+?\*\*|\[[^\]]+\]\([^)]+\))/).map((p, i) => {
    const b = /^\*\*(.+)\*\*$/.exec(p), a = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    return b ? <strong key={i}>{b[1]}</strong> : a && /^(https?:|\/|#|mailto:)/.test(a[2]) ? <a key={i} href={a[2]}>{a[1]}</a> : p;
  });
}

const Body = ({ text }: { text: string }) => <>{paras(text).map((b, k) => b.split("\n").every((l) => l.startsWith("- "))
  ? <ul key={k}>{b.split("\n").map((l, m) => <li key={m}>{inline(l.slice(2))}</li>)}</ul>
  : <p key={k}>{inline(b)}</p>)}</>;

/** The handbook as a plain printed document: hidden on screen, the only thing shown when printing (see handbook-print.css). One column, no tables. */
export function HandbookPrint({ d }: { d: any }) {
  return (
    <article className="hbp" lang="en">
      {/* position: fixed repeats on every printed page, standing in for the browser's own date/title header */}
      {d.rev && <p className="rev-l">This revision created on {new Date(d.rev.at).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "America/Detroit" })} by {d.rev.by}</p>}
      <p className="rev-r">Handbook | Kzoo Makers</p>
      <div className="front">
        <div className="mast"><p className="kick">Club Policy &amp; Safety</p><h1>{d.title}</h1></div>
        <p className="lead">{d.intro}</p>
        <h2 className="toc-h">Contents</h2>
        <ol className="toc-l">{d.sections.map((s: any, i: number) => <li key={i}>{s.title}</li>)}</ol>
      </div>
      {d.sections.map((s: any, i: number) => (
        <section key={i}>
          <h2><span>{i + 1}.</span> {s.title}</h2>
          {s.items.map((x: any, j: number) => (
            <div className="it" key={j}>
              <h3>{i + 1}.{j + 1} {x.title}</h3>
              <Body text={x.text} />
            </div>
          ))}
        </section>
      ))}
      <footer>{d.footer}<br />This is a printed copy. The current handbook is always the one online at {SITE}/handbook.</footer>
    </article>
  );
}

// Numbering and the table of contents come from the order of sections, so reordering renumbers everything.
function Handbook({ d }: { d: any }) {
  return (
    <>
      <header id="top"><canvas id="header-canvas" /><h1>{d.title}</h1><p>{d.intro}</p></header>
      <div className="layout">
        <nav className="toc">
          <h2>Table of Contents</h2>
          <ol>{d.sections.map((s: any, i: number) => (
            <li key={i}><a href={`#section-${i + 1}`}>{i + 1}. {s.title}</a>
              <ol>{s.items.map((x: any, j: number) => <li key={j}><a href={`#s${i + 1}-${j + 1}`}>{i + 1}.{j + 1} {x.title}</a></li>)}</ol>
            </li>
          ))}</ol>
        </nav>
        <main>
          <div className="preamble">{d.intro}</div>
          {d.sections.map((s: any, i: number) => (
            <section id={`section-${i + 1}`} key={i}>
              <h2>{i + 1}. {s.title}</h2>
              {s.items.map((x: any, j: number) => (
                <div className="subsection" id={`s${i + 1}-${j + 1}`} key={j}>
                  <h3>{i + 1}.{j + 1} {x.title}</h3>
                  <Body text={x.text} />
                  {/^changes to (the )?handbook/i.test(x.title) && <HandbookNotify />}
                </div>
              ))}
            </section>
          ))}
        </main>
      </div>
      <a href="#top" className="back-to-top" title="Back to top" aria-label="Back to top">↑</a>
      <footer>{d.footer}</footer>
      <HandbookPrint d={d} />
    </>
  );
}

const btns = (d: any, ...ps: string[]) => ps.map((p) => d[p + "Label"] && <span key={p}><a href={url(d[p + "Href"])} className="btn btn-main mt-3">{d[p + "Label"]}</a> </span>);

function About({ d }: { d: any }) {
  return (
    <>
      <section className="about-shot-info section-sm"><div className="container"><div className="row">
        <div className="col-lg-6 mt-20"><h2 className="mb-3">{d.heading}</h2>{paras(d.body).map((p, i) => <p key={i}>{p}</p>)}{btns(d, "btn1", "btn2")}</div>
        <div className="col-lg-6 mt-4 mt-lg-0">{d.image && <img loading="lazy" className="img-fluid" src={url(d.image)} alt={d.imageAlt} />}</div>
      </div></div></section>
      {d.videoUrl && <section className="promo-video section-sm"><div className="container">
        <Title title={d.videoTitle} />
        <div className="row"><div className="col-md-8 mx-auto"><iframe src={d.videoUrl} width="100%" height={360} frameBorder={0} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div></div>
      </div></section>}
      <section className="call-to-action-2 section"><div className="container"><div className="row"><div className="col-md-12 text-center"><h2>{lines(d.statement)}</h2></div></div></div></section>
      <section className="section gallery"><div className="container-fluid">
        <Title title={d.galleryTitle} text={d.galleryText} />
        {/* slick (legacy script.js) turns .company-gallery into a carousel on the public page */}
        <div className="row"><div className="col-md-12"><div className="company-gallery">{d.images.map((im: any, i: number) => <img key={i} loading="lazy" src={url(im.src)} alt={im.alt} />)}</div></div></div>
      </div></section>
      <section className="call-to-action-board section" style={{ backgroundImage: d.boardImage ? `url('${url(d.boardImage)}')` : undefined, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundAttachment: "scroll", padding: "100px 0" }}><div className="container"><div className="row justify-content-center"><div className="col-xl-8 col-lg-10 text-center">
        <div style={{ backgroundColor: "rgba(0, 0, 0, 0.7)", padding: 30, borderRadius: 10 }}>
          <h2 style={{ color: "white" }}>{d.boardTitle}</h2><p style={{ color: "white" }}>{d.boardText}</p>
          <a href={url(d.boardHref)} className="btn btn-main mt-3">{d.boardLabel}</a>
        </div>
      </div></div></div></section>
      <Counters />
      <section className="call-to-action section"><div className="container"><div className="row justify-content-center"><div className="col-xl-6 col-lg-8 text-center">
        <h2>{d.ctaTitle}</h2><p>{d.ctaText}</p>{btns(d, "cta1", "cta2")}
      </div></div></div></section>
    </>
  );
}

const heading: CSSProperties = { color: "#6c757d", fontWeight: 600 };
const ring: CSSProperties = { fontSize: 60, color: "#f9b234", border: "2px dashed #f9b234", borderRadius: "50%", padding: 20, width: 100, height: 100, display: "inline-flex", alignItems: "center", justifyContent: "center" };

// #hours-contact-card is filled in by the legacy hours.js; #map_canvas by the legacy map script.
function Contact({ d }: { d: any }) {
  return (
    <>
      <section className="contact-us" id="contact"><div className="container"><div className="row">
        {d.cards.map((c: any, i: number) => (
          <div className="col-lg-4 col-md-6 mb-4" key={i}>
            <a href={url(c.href)} {...(/^https?:/.test(c.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="contact-card text-center p-5 bg-white shadow-sm h-100">
                <div className="contact-icon mb-4"><i className={`tf-ion-ios-${c.icon}`} style={ring} /></div>
                <h3 className="mb-3" style={heading}>{c.title}</h3>
                {c.button && <div className="btn btn-main">{c.button}</div>}
                {c.line1 && <h6 className="mb-3" style={heading}><br />{c.line1}</h6>}
                {c.hours === "yes" && <div id="hours-contact-card"><p style={{ color: "#666" }}>Loading hours...</p></div>}
                {c.line2 && <h6 className="mb-3" style={heading}><br /><i>{c.line2}</i></h6>}
              </div>
            </a>
          </div>
        ))}
      </div></div></section>
      <ContactForm kind="contact" />
      <div className="google-map"><div id="map_canvas" className="map_canvas" data-latitude={d.lat} data-longitude={d.lng} data-marker="images/marker.png" data-marker-name={d.marker} /></div>
    </>
  );
}

function Others({ d }: { d: any }) {
  return (
    <section className="about-2 section" id="other-makerspaces"><div className="container">
      <div className="row justify-content-center"><div className="col-lg-10"><div className="title text-center"><h2>{d.title}</h2><p>{d.intro}</p><div className="border" /></div></div></div>
      {d.groups.map((g: any, i: number) => (
        <div className="row justify-content-center mt-5" key={i}><div className="col-lg-10">
          <h3 className="mb-3">{g.title}</h3>
          <div className="table-responsive"><table className="table table-striped table-bordered">
            <thead className="thead-dark"><tr><th scope="col">City</th><th scope="col">Makerspace</th><th scope="col">Web Address</th></tr></thead>
            <tbody>{g.spaces.map((s: any, j: number) => <tr key={j}><td>{s.city}</td><td>{s.name}</td><td><a href={url(s.url)} target="_blank" rel="noopener">{s.url}</a></td></tr>)}</tbody>
          </table></div>
          {i === d.groups.length - 1 && d.note && <p className="mt-4"><small>{d.note}</small></p>}
        </div></div>
      ))}
    </div></section>
  );
}

const ICONS: Record<string, string> = { check: "android-checkmark-circle", people: "android-people", star: "android-star" };

function Laser({ d }: { d: any }) {
  return (
    <>
      <section className="portfolio section-sm" id="metal-shop-gallery"><div className="container-fluid">
        <Title title={d.galleryTitle} text={d.galleryText} wrap="col-lg-6 col-md-7" />
        <DragCarousel items={d.slides.map((s: any) => ({ src: url(s.image), alt: s.alt, caption: s.caption }))} />
      </div></section>
      <section className="about-2 section" id="laser-shop-details"><div className="container">
        <Title title={d.detailsTitle} text={d.detailsIntro} wrap="col-lg-10" />
        <div className="row mt-5">
          <div className="col-md-6 mb-4"><h3>{d.equipTitle}</h3><ul className="checklist">{rows(d.equipment).map((r, i) => <li key={i}>{inline(r)}</li>)}</ul></div>
          <div className="col-md-6 mb-4">
            <h3>{d.materialsTitle}</h3>
            <p><b>{d.canTitle}</b></p><ul className="checklist">{rows(d.can).map((r, i) => <li key={i}>{r}</li>)}</ul>
            <p className="mt-3"><b>{d.cannotTitle}</b></p><ul style={{ listStyleType: "none", paddingLeft: 0 }}>{rows(d.cannot).map((r, i) => <li key={i}>❌ {r}</li>)}</ul>
          </div>
        </div>
        <div className="row mt-4"><div className="col-lg-12"><h3>{d.startTitle}</h3>{paras(d.startText).map((p, i) => <p key={i}>{p}</p>)}</div></div>
        <div className="row mt-5"><div className="col-lg-12 text-center">
          <h3>{d.readyTitle}</h3><p>{d.readyText}</p>
          {d.buttons.map((b: any, i: number) => <a key={i} href={url(b.href)} className={`btn btn-main mt-20${i ? " ml-2" : ""}`}>{b.label}</a>)}
        </div></div>
      </div></section>
      <section className="section" style={{ background: "#f9f9f9" }}><div className="container">
        <Title title={d.safetyTitle} wrap="col-lg-8" />
        <div className="row mt-4">{d.safety.map((s: any, i: number) => (
          <div className="col-md-4 mb-4 text-center" key={i}><i className={`tf-ion-${ICONS[s.icon]}`} style={{ fontSize: 60, color: "#28ABE3" }} /><h4 className="mt-3">{s.title}</h4><p>{s.text}</p></div>
        ))}</div>
      </div></section>
      <section className="section"><div className="container">
        <Title title={d.faqTitle} wrap="col-lg-8" />
        <div className="row mt-4"><div className="col-lg-10 mx-auto">{d.faqs.map((f: any, i: number) => <div className="mb-4" key={i}><h4>{f.q}</h4><p>{f.a}</p></div>)}</div></div>
      </div></section>
    </>
  );
}

// Generic sections page (Explore Us, Learn More): photo carousel, then sections in the order the editor set.
// Look names match the schema in lib/guided.ts; class names come from each page's legacy CSS (feature-card, highlight-box, stat-box…).
const SHOP_ICONS: Record<string, string> = { check: "checkmark-circle", people: "people", star: "star", palette: "color-palette", pencil: "create", idea: "bulb", laptop: "laptop" };

// Paragraphs, "- " bullet lists, **bold** and [links] (same rules as the handbook).
const rich = (t = "", ul = "checklist") => paras(t).map((b, k) => b.split("\n").every((l) => l.startsWith("- "))
  ? <ul key={k} className={ul}>{b.split("\n").map((l, m) => <li key={m}>{inline(l.slice(2))}</li>)}</ul>
  : <p key={k}>{inline(b)}</p>);

const Buttons = ({ list, lg }: { list: any[]; lg?: boolean }) => list.length ? <div className="text-center mt-4">{list.map((b, j) => <a key={j} href={url(b.href)} className={`btn btn-main${lg ? " btn-lg" : ""}${j ? " ml-2" : ""}`}>{b.label}</a>)}</div> : null;
const H3 = ({ children }: { children?: string }) => children ? <h3 className="text-center mb-4">{children}</h3> : null;

function Section({ s }: { s: any }) {
  const per = Math.min(Number(s.columns) || 1, 3), col = `col-md-${12 / per}`, grey = s.background === "Grey";
  const bg = grey ? { background: "#f9f9f9" } : undefined;
  const wrap = (kids: React.ReactNode, cls = "section") => <section className={cls} style={bg}><div className="container">{kids}</div></section>;
  const Row = ({ children }: { children: React.ReactNode }) => <div className="row">{children}</div>;
  switch (s.look) {
    case "Banner":
      return (
        <section className="call-to-action section" style={s.image ? { position: "relative", backgroundImage: `url('${url(s.image)}')`, backgroundSize: "cover", backgroundPosition: "center", padding: "100px 0" } : undefined}>
          {s.image && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.6)" }} />}
          <div className="container" style={{ position: "relative" }}><div className="row justify-content-center"><div className="col-xl-8 col-lg-10 text-center">
            <h2 style={s.image ? { color: "#fff" } : undefined}>{s.title}</h2>
            {s.intro && <p className={s.image ? "lead mt-4" : ""} style={s.image ? { color: "#fff" } : undefined}>{s.intro}</p>}
            {s.buttons.map((b: any, j: number) => <span key={j}><a href={url(b.href)} className="btn btn-main btn-lg">{b.label}</a> </span>)}
          </div></div></div>
        </section>
      );
    case "Highlight box":
      return wrap(<div className="row justify-content-center"><div className="col-lg-10"><div className="highlight-box text-center">
        <h3>{s.title}</h3>{s.intro && <p className="lead">{s.intro}</p>}
        <div className="row mt-4">{s.items.map((it: any, j: number) => (
          <div className={`${col} mb-3`} key={j}>{it.text ? <><h5>{it.heading}</h5>{rich(it.text)}</> : <span className="comparison-badge">{it.heading}</span>}</div>
        ))}</div>
        {s.outro && <p className="lead mt-4">{inline(s.outro)}</p>}
        <Buttons list={s.buttons} />
      </div></div></div>);
    case "Feature cards":
    case "Stats":
      return wrap(<div className="row justify-content-center"><div className="col-lg-10">
        <H3>{s.title}</H3>{s.intro && <p className="text-center">{s.intro}</p>}
        <Row>{s.items.map((it: any, j: number) => (
          <div className={`${col} mb-4`} key={j}><div className={`feature-card h-100${it.emoji || s.look === "Stats" ? " text-center" : ""}`}>
            {s.look === "Stats" && <div className="stat-box"><span className="number">{it.heading}</span><span className="label">{it.label}</span></div>}
            {it.emoji && <span className="feature-icon">{it.emoji}</span>}
            {s.look !== "Stats" && it.heading && <h4>{it.heading}</h4>}
            <div className={s.look === "Stats" ? "mt-3" : ""}>{rich(it.text, "feature-list")}</div>
            {it.linkLabel && <a href={url(it.linkHref)} className="btn btn-main btn-sm">{it.linkLabel}</a>}
          </div></div>
        ))}</Row>
        <Buttons list={s.buttons} lg />
      </div></div>);
    default: { // Columns of text, Icon cards, Centered call-to-action
      const cards = s.look === "Icon cards", center = cards || s.look === "Centered call-to-action";
      return wrap(<>
        {s.title && <Title title={s.title} text={s.intro} wrap="col-lg-10" />}
        {!s.title && s.intro && <p className="text-center">{s.intro}</p>}
        <div className="row mt-4">{s.items.map((it: any, j: number) => (
          <div className={`${per === 1 && !cards ? "col-md-12" : col} mb-4${center ? " text-center" : ""}`} key={j}>
            {cards && it.icon !== "none" && <i className={`tf-ion-android-${SHOP_ICONS[it.icon] ?? "star"}`} style={{ fontSize: 60, color: "#28ABE3" }} />}
            {it.heading && (cards ? <h4 className="mt-3">{it.heading}</h4> : <h3>{it.heading}</h3>)}
            {rich(it.text)}
          </div>
        ))}</div>
        <Buttons list={s.buttons} />
      </>, s.title && !grey ? "about-2 section" : s.title || grey ? "section" : "section-sm");
    }
  }
}

function Shop({ d }: { d: any }) {
  return (
    <>
      {d.slides.length > 0 && <section className="portfolio section-sm" id="metal-shop-gallery"><div className="container-fluid">
        {d.galleryTitle && <Title title={d.galleryTitle} text={d.galleryText} wrap="col-lg-6 col-md-7" />}
        <DragCarousel items={d.slides.map((s: any) => ({ src: url(s.image), alt: s.alt, caption: s.caption }))} />
      </div></section>}
      {d.sections.map((s: any, i: number) => <Section key={i} s={s} />)}
    </>
  );
}

function HowTo({ d }: { d: any }) {
  return (
    <>
      <section className="page-title-section" style={{ backgroundImage: d.heroImage ? `url(${url(d.heroImage)})` : undefined }}><div className="container"><div className="row"><div className="col-md-12">
        <h1>{d.heroTitle}</h1><p>{d.heroText}</p>
      </div></div></div></section>
      <section className="section"><div className="container"><div className="row justify-content-center"><div className="col-lg-10 col-xl-8">
        <GuideBrowser categories={d.categories.map((c: any) => ({ ...c, articles: c.articles.map((a: any) => ({ ...a, url: url(a.url) })) }))} />
      </div></div></div></section>
    </>
  );
}
function Donate({ d }: { d: any }) {
  return (
    <section className="inventory-section"><div className="container">
      <div className="row justify-content-center mb-5"><div className="col-lg-8"><div className="title text-center"><h2>{d.heading}</h2><p className="lead">{d.lead}</p><div className="border" /></div></div></div>
      <div className="row justify-content-center mb-5"><div className="col-lg-10"><div className="donation-info-section">
        <h3>{d.whyTitle}</h3><p>{d.whyIntro}</p>
        <ul className="donation-benefits">{rows(d.benefits).map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>
        <h3>{d.howTitle}</h3>
        {paras(d.howText).map((p, i) => <p key={i}>{p}</p>)}
        {d.contactLabel && <p><strong><a href={url(d.contactHref)}>{d.contactLabel}</a></strong></p>}
        <h3>{d.needsTitle}</h3><p>{d.needsText}</p><div className="border" />
      </div></div></div>
      <DonationForm />
      <DonationNeeds items={d.items} statLabel={d.statLabel} />
    </div></section>
  );
}

const VIEWS: Record<string, (p: { d: any }) => React.ReactElement> = { team: Team, history: History, pricing: Pricing, handbook: Handbook, about: About, contact: Contact, "other-makerspaces": Others, "laser-shop": Laser, "wood-shop": Shop, "metal-shop": Shop, "3d-printing": Shop, "craft-room-kalamazoo": Shop, "meeting-space": Shop, what_is_a_makerspace: Shop, "why-kzoo-makers": Shop, "how-to": HowTo, "tools-we-are-seeking-donations-kalamazoo": Donate };

// The homepage is rendered in parts so the page can keep its other sections (banner, tour, hours, news) between them.
function Home({ d, part }: { d: any; part?: string }) {
  if (part === "hero") return (
    <div className="hero-slider">
      {d.slides.map((s: any, i: number) => (
        <div className="slider-item th-fullpage hero-area" style={{ backgroundImage: `url(${url(s.image)})` }} key={i}><div className="container"><div className="row"><div className="col-md-12 text-center">
          <h1 data-duration-in=".3" data-animation-in="fadeInDown" data-delay-in=".1">{lines(s.title)}</h1>
          <p data-duration-in=".3" data-animation-in="fadeInDown" data-delay-in=".5">{s.text}</p>
          {s.typing === "yes" && (
            <div className="typing-container" data-words={JSON.stringify(d.words.map((w: any) => w.word).filter(Boolean))} data-duration-in=".3" data-animation-in="fadeInUp" data-delay-in=".8">
              <div className="first-line"><span className="static-text">We make with</span> <span className="word" /></div>
              <div className="second-line">What will you make with?</div>
            </div>
          )}
          {s.buttonLabel && <a data-duration-in=".3" data-animation-in="fadeInDown" data-delay-in=".8" className="btn btn-main" href={url(s.buttonHref)}>{s.buttonLabel}</a>}
        </div></div></div></div>
      ))}
    </div>
  );
  if (part === "what") return (
    <section className="what-is-makerspace section">
      <div className="rolling-ball" id="rolling-ball"><img src="/images/clipart/qmarkball.png" alt="Rolling question mark ball" /></div>
      <div className="container"><div className="row justify-content-center">
        <div className="col-md-6 mb-4 mb-md-0">{d.whatImage && <img loading="lazy" src={url(d.whatImage)} className="img-fluid questionmark-target" id="questionmark-target" alt="" />}</div>
        <div className="col-lg-8"><div className="title text-center">
          <div className="border" /><h2>{d.whatTitle}</h2><div className="border" />
          {paras(d.whatText).map((p, i) => <span key={i}>{i === 1 && <hr />}<p>{p}</p></span>)}
          {d.whatLabel && <a href={url(d.whatHref)} className="btn btn-main btn-sm mt-3">{d.whatLabel}</a>}
        </div></div>
      </div></div>
    </section>
  );
  if (part === "offer") return (
    <section className="service-2 section"><div className="container">
      <Title title={d.offerTitle} text={d.offerText} wrap="col-lg-6" />
      <div className="row"><div className="col-md-12"><div className="gallery-container">
        {d.cards.map((c: any, i: number) => (
          <figure className="polaroid" key={i}><a href={url(c.href)} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <img src={url(c.image)} alt={c.label} className="img-fluid" /><figcaption>{c.label}</figcaption>
          </a></figure>
        ))}
      </div></div></div>
    </div></section>
  );
  if (part === "how") return (
    <section className="about-2 section" id="about"><div className="container">
      <Title title={d.howTitle} wrap="col-lg-6" />
      <div className="row">
        <div className="col-md-6 mb-4 mb-md-0">{d.howImage && <img loading="lazy" src={url(d.howImage)} className="img-fluid" alt="" />}</div>
        <div className="col-md-6">
          <ul className="checklist">{rows(d.howBullets).map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>
          {d.btn1Label && <a href={url(d.btn1Href)} className="btn btn-main mt-20">{d.btn1Label}</a>}
          {d.btn2Label && <><br /><br /><a href={url(d.btn2Href)} className="btn btn-main pricing-cta">{d.btn2Label}</a></>}
        </div>
      </div>
    </div></section>
  );
  if (part === "reviews") {
    const cols = [0, 1, 2].map((c) => d.reviews.filter((_: any, i: number) => i % 3 === c));
    const extra = ["", " d-md-block", " d-lg-block"];
    return (
      <section className="reviews-section" id="testimonial"><div className="container-fluid reviews-wrapper" style={{ maxWidth: 1280 }}>
        <div className="text-center mb-5 pb-3"><h2 className="gradient-text">{d.reviewsTitle}</h2><div className="border" /><p className="text-gray-400">{d.reviewsText}</p></div>
        <div className="row g-4 g-md-5">
          {cols.map((list, c) => (
            <div className={`col-12 col-md-6 col-lg-4${extra[c]}`} key={c}>
              <div className={`review-container${c === 1 ? " review-container-reverse" : ""}`}>
                <div className={`d-flex flex-column gap-4 group-hover-pause ${c === 1 ? "animate-scroll-b2t" : "animate-scroll-t2b"}`}>
                  {[0, 1].map((copy) => ( // second copy makes the scroll loop seamless
                    <div className="d-flex flex-column gap-4" key={copy} aria-hidden={copy ? true : undefined}>
                      {list.map((r: any, i: number) => (
                        <div className="review-card" key={i}>
                          <div className="d-flex align-items-center mb-3">
                            {r.photo ? <img src={url(r.photo)} alt={r.name} className="review-avatar me-3" />
                              : <span className="review-avatar me-3 d-inline-flex align-items-center justify-content-center fw-bold text-white" aria-hidden style={{ background: "#6c63ff", flex: "none" }}>{(r.name || "?")[0].toUpperCase()}</span>}
                            <div><p className="fw-semibold text-white mb-0">{r.name}</p><p className="small text-gray-500 mb-0">{r.role}</p></div>
                          </div>
                          <div className="stars mb-2">★★★★★</div>
                          <p className="text-gray-300 fst-italic mb-0">"{r.text}"</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <ReviewForm />
      </div></section>
    );
  }
  return null;
}

export function GuidedPage({ kind, data, part }: { kind: string; data: any; part?: string }) {
  if (kind === "index") return data ? <Home d={data} part={part} /> : null;
  const V = VIEWS[kind] as ((p: { d: any }) => React.ReactElement) | undefined;
  return V && data ? <V d={data} /> : null;
}
