// Keep legacy URLs alive: /about.html -> /about, /index.html -> /
const nextConfig = {
  async rewrites() {
    return {
      afterFiles: [
        // The eBay listing template (HTML to paste into a listing) is served at /ebay/template.
        { source: "/ebay/template", destination: "/images/ebay/template.html" }],
      // Files in public/ win; /images and /download are not in the Docker image, so they land here and come from the bucket (app/static-files).
      fallback: [{ source: "/images/:path*", destination: "/static-files/images/:path*" }, { source: "/download/:path*", destination: "/static-files/download/:path*" }],
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
