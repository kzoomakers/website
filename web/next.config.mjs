// Keep legacy URLs alive: /about.html -> /about, /index.html -> /
const nextConfig = {
  async redirects() {
    return [
      { source: "/webmaster/:p*", destination: "/admin/webmaster/:p*", permanent: false },
      { source: "/mailadmin/:p*", destination: "/admin/mail/:p*", permanent: false },
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/:slug.html", destination: "/:slug", permanent: true },
    ];
  },
};
export default nextConfig;
