import type { Config } from "@puckeditor/core";
import { Navbar, Footer, Counters } from "@/components/chrome";

// Markup below mirrors the legacy HTML class-for-class so css/style.css applies unchanged.
const url = (h = "") => (/^(https?:|#|\/|mailto:)/.test(h) ? h : "/" + h);
const paras = (t = "") => t.split(/\n\s*\n/).filter(Boolean);
const lines = (t = "") => t.split("\n").flatMap((l, i) => (i ? [<br key={i} />, l] : [l]));
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
  PageHeader: { title: string };
  TwoColumnText: { heading: string; body: string; buttons: { label: string; href: string }[]; image: string; imageAlt: string };
  VideoEmbed: { title: string; youtubeUrl: string; height: number };
  Statement: { text: string };
  Gallery: { title: string; text: string; images: { src: string; alt: string }[] };
  ImageCta: { heading: string; text: string; buttonLabel: string; buttonHref: string; bgImage: string };
  Counters: {};
  CallToAction: { heading: string; text: string; buttons: { label: string; href: string }[] };
};

export const config: Config<Props, { title: string; description: string }> = {
  root: {
    fields: { title: { type: "text" }, description: { type: "textarea" } },
    defaultProps: { title: "Kzoo Makers", description: "" },
    render: ({ children }) => (
      <>
        <Navbar />
        {children}
        <Footer />
      </>
    ),
  },
  components: {
    PageHeader: {
      fields: { title: { type: "text" } },
      defaultProps: { title: "Page title" },
      render: ({ title }) => (
        <section className="single-page-header">
          <div className="container"><div className="row"><div className="col-md-12">
            <h2>{title}</h2>
            <ol className="breadcrumb header-bradcrumb justify-content-center">
              <li className="breadcrumb-item"><a href="/" className="text-white">Home</a></li>
              <li className="breadcrumb-item active" aria-current="page">{title}</li>
            </ol>
          </div></div></div>
        </section>
      ),
    },
    TwoColumnText: {
      fields: {
        heading: { type: "text" },
        body: { type: "textarea", label: "Body (blank line = new paragraph)" },
        buttons,
        image: { type: "text", label: "Image URL" },
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
        images: { type: "array", arrayFields: { src: { type: "text" }, alt: { type: "text" } }, getItemSummary: (i: any) => i.src },
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
      fields: { heading: { type: "text" }, text: { type: "textarea" }, buttonLabel: { type: "text" }, buttonHref: { type: "text" }, bgImage: { type: "text" } },
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
