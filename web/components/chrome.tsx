import { AdminLink } from "./admin-link";
import navbar from "@/data/globals/navbar.json";
import footer from "@/data/globals/footer.json";
import counters from "@/data/globals/counters.json";

// Legacy hrefs are relative ("about.html"); make them root-absolute so they work from any depth.
const url = (h: string) => (/^(https?:|#|\/|mailto:)/.test(h) ? h : "/" + h);
const H = (html: string) => ({ __html: html });

type Item = { label: string; href?: string; items?: Item[] };

function Menu({ item, id, top }: { item: Item; id: string; top?: boolean }) {
  if (!item.items?.length) return <li className={top ? "nav-item" : undefined}><a className={top ? "nav-link" : "dropdown-item"} href={url(item.href ?? "")}>{item.label}</a></li>;
  return (
    <li className={top ? "nav-item dropdown" : "dropdown dropdown-submenu dropright"}>
      <a className={top ? "nav-link dropdown-toggle" : "dropdown-item dropdown-toggle"} href="#!" id={id} role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
        {item.label} {top && <i className="tf-ion-chevron-down" />}
      </a>
      <ul className="dropdown-menu" aria-labelledby={id}>
        {item.items.map((s, i) => <Menu key={i} item={s} id={`${id}-${i}`} />)}
      </ul>
    </li>
  );
}

export function Navbar({ menu }: { menu: Item[] }) {
  return (
    <header className="navigation fixed-top">
      <div className="container">
        <nav className="navbar navbar-expand-lg navbar-light px-0">
          <a className="navbar-brand logo" href={url(navbar.logo.href)}>
            <img loading="lazy" className="logo-default" src={"/" + navbar.logo.default} alt={navbar.logo.alt} />
            <img loading="lazy" className="logo-white" src={"/" + navbar.logo.white} alt={navbar.logo.alt} />
          </a>
          <button className="navbar-toggler" type="button" data-toggle="collapse" data-target="#navigation" aria-controls="navigation" aria-expanded="false" aria-label="Toggle navigation">
            <span className="navbar-toggler-icon" />
          </button>
          <div id="menu-btn" className="close"><span className="text">MENU</span></div>
          <div className="collapse navbar-collapse" id="navigation">
            <ul className="navbar-nav ml-auto text-center">
              {menu.map((m, i) => <Menu key={i} item={m} id={`navbarDropdown${i}`} top />)}
            </ul>
          </div>
        </nav>
      </div>
    </header>
  );
}

export function Counters() {
  return (
    <section className="counter-wrapper section-sm">
      <div className="container">
        <div className="row">
          {counters.counters.map((c: any) => (
            <div key={c.id} className={`${c.columnClass} text-center`}>
              <div className={`counters-item${c.killBorder ? " kill-border" : ""}`}>
                <i className={c.icon} />
                <div><span className="counter" data-count={c.count}>0</span></div>
                <h3>{c.label}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const col = (id: string) => (id === "quicklinks" ? "2" : "3");
  return (
    <footer id="footer" className="bg-one">
      <div className="top-footer">
        <div className="container">
          <div className="row justify-content-around">
            <div className="col-lg-4 col-md-6 mb-5 mb-lg-0">
              <h3>{footer.about.title}</h3>
              <p>{footer.about.description}</p>
              <div id="hours-footer-section"><p>Loading hours...</p></div>
            </div>
            {footer.columns.map((c: any) => (
              <div key={c.id} className={`col-lg-${col(c.id)} col-md-6 mb-5 ${c.id === "quicklinks" ? "mb-md-0" : "mb-lg-0"}`}>
                <ul>
                  <li><h3>{c.title}</h3></li>
                  {c.links.map((l: any) => <li key={l.href}><a href={url(l.href)}>{l.label}</a></li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <h5 dangerouslySetInnerHTML={H(footer.copyright.text)} />
        <h6>{footer.copyright.credit.text} <a href={footer.copyright.credit.link.href}>{footer.copyright.credit.link.label}</a></h6>
        <AdminLink />
      </div>
    </footer>
  );
}

// Site theme. Rendered per page (not in the root layout) so "standalone" pages can opt out.
// `precedence` makes React 19 hoist these into <head> (and into Puck's iframe) in this order.
const THEME = ["/plugins/themefisher-font/style.css", "/plugins/bootstrap/bootstrap.min.css", "/plugins/lightbox2/css/lightbox.min.css",
  "/plugins/animate/animate.css", "/plugins/slick/slick.css", "/css/style.css"];
export const ThemeCss = () => <>{THEME.map((h) => <link key={h} rel="stylesheet" href={h} precedence="theme" />)}</>;
