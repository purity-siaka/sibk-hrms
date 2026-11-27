/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config) => {
    // pdfjs-dist optionally requires node-canvas; the browser build does not need it.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
