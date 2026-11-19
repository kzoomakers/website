import type { ReactNode } from "react";
import { headers } from "next/headers";
import SubscribeForms from "@/components/subscribe-popup";
import LinkTracker from "@/components/link-tracker";
import GaTag from "@/components/ga-tag";
import CookieConsent from "@/components/cookie-consent";

export default async function RootLayout({ children }: { children: ReactNode }) {
  if ((await headers()).get("x-feed") === "1") { // talk.kzoomakers.org: own shell, none of the main site's popups, tracking or consent banner (set by middleware.ts)
    return (
      <html lang="en">
        <head>
          <meta name="color-scheme" content="light dark" />
        </head>
        <body id="body">{children}</body>
      </html>
    );
  }
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
        <link rel="shortcut icon" type="image/x-icon" href="/images/favicon.png" />
      </head>
      <body id="body">{children}<SubscribeForms /><LinkTracker /><GaTag /><CookieConsent /></body>
    </html>
  );
}
