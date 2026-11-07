import navbar from "@/data/globals/navbar.json";
import footer from "@/data/globals/footer.json";
import counters from "@/data/globals/counters.json";

// Legacy hrefs are relative ("about.html"); make them root-absolute so they work from any depth.
const url = (h: string) => (/^(https?:|#|\/|mailto:)/.test(h) ? h : "/" + h);
const H = (html: string) => ({ __html: html });

function Sub({ item, pid }: { item: any; pid: string }) {
  const id = `dropdown${pid}${item.label.replace(/\W/g, "")}`;
  return (
    <li className={`dropdown dropdown-submenu ${item.direction || "dropright"}`}>
      <a className="dropdown-item dropdown-toggle" href="#!" id={id} role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
        {item.label} <i className={item.icon} />
      </a>
      <ul className="dropdown-menu" aria-labelledby={id}>
        {item.items.map((s: any) => s.type === "submenu" ? <Sub key={s.label} item={s} pid={id} /> : <li key={s.href}><a className="dropdown-item" href={url(s.href)}>{s.label}</a></li>)}
      </ul>
    </li>
  );
}

export function Navbar() {
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
              {navbar.menuItems.map((m: any) =>
                m.type === "dropdown" ? (
                  <li key={m.id} className="nav-item dropdown">
                    <a className="nav-link dropdown-toggle" href="#!" id={`navbarDropdown${m.id}`} role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                      {m.label} <i className={m.icon} />
                    </a>
                    <ul className="dropdown-menu" aria-labelledby={`navbarDropdown${m.id}`}>
                      {m.items.map((s: any) => s.type === "submenu" ? <Sub key={s.label} item={s} pid={m.id} /> : <li key={s.href}><a className="dropdown-item" href={url(s.href)}>{s.label}</a></li>)}
                    </ul>
                  </li>
                ) : (
                  <li key={m.id} className="nav-item"><a className="nav-link" href={url(m.href)}>{m.label}</a></li>
                )
              )}
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
      </div>
    </footer>
  );
}
