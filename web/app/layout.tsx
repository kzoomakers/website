import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
        <link rel="shortcut icon" type="image/x-icon" href="/images/favicon.png" />
        <link rel="stylesheet" href="/plugins/themefisher-font/style.css" />
        <link rel="stylesheet" href="/plugins/bootstrap/bootstrap.min.css" />
        <link rel="stylesheet" href="/plugins/lightbox2/css/lightbox.min.css" />
        <link rel="stylesheet" href="/plugins/animate/animate.css" />
        <link rel="stylesheet" href="/plugins/slick/slick.css" />
        <link rel="stylesheet" href="/css/style.css" />
      </head>
      <body id="body">{children}</body>
    </html>
  );
}
