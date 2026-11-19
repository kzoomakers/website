// Keep legacy URLs alive: /about.html -> /about, /index.html -> /
const ASSETS = "https://kzoomakers-public-assets.fly.storage.tigris.dev";
const nextConfig = {
  async rewrites() {
    return {
      afterFiles: [
        // The eBay listing template (HTML to paste into a listing) is served at /ebay/template.
        { source: "/ebay/template", destination: `${ASSETS}/images/ebay/template.html` }, // direct: rewrites don't chain, and the file is not in the image
        // /images and /download are not in the Docker image (CI syncs them to this public Tigris bucket). afterFiles, not fallback: files in public/ still win, but the
        // catch-all page app/[[...path]] matches every URL, so a fallback rewrite would never run.
        { source: "/images/:path*", destination: `${ASSETS}/images/:path*` }, { source: "/download/:path*", destination: `${ASSETS}/download/:path*` }],
    };
  },
  devIndicators: { position: "bottom-right" },
  async redirects() {
    return [
      { source: "/webmaster/:p*", destination: "/admin/webmaster/:p*", permanent: false },
      { source: "/admin/mail/:p*", destination: "/admin/mailer/:p*", permanent: true },
      { source: "/mailadmin/:p*", destination: "/admin/mailer/:p*", permanent: false },
      { source: "/admin/board/:p*", destination: "/admin/esign/:p*", permanent: false },
      { source: "/admin/signed-docs/:p*", destination: "/admin/esign/:p*", permanent: true },
      // Old redirect pages: tours are booked on /tours now; Discord goes through /go so the click is counted.
      { source: "/tour-form-redirect(.html)?", destination: "/tours", permanent: true },
      { source: "/discord-redirect(.html)?", destination: "/go?l=discord", permanent: false },
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/:slug.html", destination: "/:slug", permanent: true },
    ];
  },
};
export default nextConfig;
