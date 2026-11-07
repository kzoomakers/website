// Keep legacy URLs alive: /about.html -> /about, /index.html -> /
const nextConfig = {
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/:slug.html", destination: "/:slug", permanent: true },
    ];
  },
};
export default nextConfig;
