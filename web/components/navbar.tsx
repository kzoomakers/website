"use client";
import { useState } from "react";
import { AccountLink } from "./account-link";
import navbar from "@/data/globals/navbar.json";

// Legacy hrefs are relative ("about.html"); make them root-absolute so they work from any depth.
const url = (h: string) => (/^(https?:|#|\/|mailto:)/.test(h) ? h : "/" + h);

type Item = { label: string; href?: string; items?: Item[] };

// `open` holds the id of the open dropdown; submenu ids extend their parent's ("navbarDropdown1-2"), so a parent stays open while its child is.
function Menu({ item, id, top, open, setOpen }: { item: Item; id: string; top?: boolean; open: string; setOpen: (id: string) => void }) {
  if (!item.items?.length) return <li className={top ? "nav-item" : undefined}><a className={top ? "nav-link" : "dropdown-item"} href={url(item.href ?? "")}>{item.label}</a></li>;
  const on = open === id || open.startsWith(id + "-");
  const parent = id.includes("-") ? id.slice(0, id.lastIndexOf("-")) : "";
  const toggle = (e: React.MouseEvent) => { e.preventDefault(); setOpen(open === id ? parent : id); };
  return (
    <li className={(top ? "nav-item dropdown" : "dropdown dropdown-submenu dropright") + (on ? " show" : "")}>
      <a className={top ? "nav-link dropdown-toggle" : "dropdown-item dropdown-toggle"} href="#!" id={id} role="button" aria-haspopup="true" aria-expanded={on} onClick={toggle}>
        {item.label} {top && <i className="tf-ion-chevron-down" />}
      </a>
      <ul className={"dropdown-menu" + (on ? " show" : "")} aria-labelledby={id}>
        {item.items.map((s, i) => <Menu key={i} item={s} id={`${id}-${i}`} open={open} setOpen={setOpen} />)}
      </ul>
    </li>
  );
}

export function Navbar({ menu }: { menu: Item[] }) {
  const [shown, setShown] = useState(false), [open, setOpen] = useState("");
  return (
    <header className="navigation fixed-top">
      <div className="container">
        <nav className="navbar navbar-expand-lg navbar-light px-0">
          <a className="navbar-brand logo" href={url(navbar.logo.href)}>
            <img loading="lazy" className="logo-default" src={"/" + navbar.logo.default} alt={navbar.logo.alt} />
            <img loading="lazy" className="logo-white" src={"/" + navbar.logo.white} alt={navbar.logo.alt} />
          </a>
          {/* .navbar-toggler is hidden by CSS at every width; #menu-btn is the real mobile toggle. */}
          <div id="menu-btn" className={shown ? "open" : "close"} role="button" tabIndex={0} aria-controls="navigation" aria-expanded={shown} aria-label="Toggle navigation"
            onClick={() => setShown(!shown)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShown(!shown); } }}>
            <span className="text">MENU</span>
          </div>
          <div className={"collapse navbar-collapse" + (shown ? " show" : "")} id="navigation">
            <ul className="navbar-nav ml-auto text-center">
              {menu.map((m, i) => <Menu key={i} item={m} id={`navbarDropdown${i}`} top open={open} setOpen={setOpen} />)}
              <AccountLink />
            </ul>
          </div>
        </nav>
      </div>
    </header>
  );
}
