import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

// layouts/application.html.erb for a logged-out visitor. Same element ids and classes, since application.css and the JS depend on them.
export const Nav = ({ href, children, path, icon, title }: { title?: string; href: string; children: ReactNode; path: string; icon?: IconName }) => {
  const strip = (p: string) => p.replace(/\/page\/\d+$/, ""), period = /\/\d+[dwmy]$/, cur = strip(path), target = strip(href);
  return <a href={href} title={title} aria-current={(period.test(target) ? cur : cur.replace(period, "")) === target ? "page" : undefined}>{icon && <Icon name={icon} />}<span>{children}</span></a>; // link_to_different_page: /top/3d is still "Top"
};
