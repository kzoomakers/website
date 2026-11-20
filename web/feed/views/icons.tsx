import type { ReactNode } from "react";

// Small line icons (Feather paths) for the header; each gets its own soft tint from the purple/pink/blue family so the bar reads as one set.
const P: Record<string, [string, ReactNode]> = {
  active: ["#fbbf24", <polygon key="a" points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />],
  recent: ["#93c5fd", <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>],
  comments: ["#f0abfc", <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />],
  search: ["#a5b4fc", <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>],
  login: ["#86efac", <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></>],
  submit: ["#f9a8d4", <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></>],
  invitations: ["#c4b5fd", <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>],
  messages: ["#7dd3fc", <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>],
  settings: ["#d8b4fe", <><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></>],
  mod: ["#fda4af", <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />],
  hats: ["#fcd34d", <><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></>],
  user: ["#a7f3d0", <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>],
  logout: ["#fca5a5", <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>],
};
export type IconName = keyof typeof P;

export const Icon = ({ name }: { name: IconName }) => (
  <svg className="nav_icon" style={{ "--ic": P[name][0] } as React.CSSProperties} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[name][1]}</svg>
);
