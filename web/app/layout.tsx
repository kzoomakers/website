import type { ReactNode } from "react";
import SubscribeForms from "@/components/subscribe-popup";
import LinkTracker from "@/components/link-tracker";
import GaTag from "@/components/ga-tag";
import CookieConsent from "@/components/cookie-consent";

export default function RootLayout({ children }: { children: ReactNode }) {
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
