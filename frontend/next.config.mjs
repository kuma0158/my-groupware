const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the Tunnel production build separate from the local development server.
  distDir: process.env.COREDESK_DIST_DIR ?? ".next",
  // ブラウザからは同一オリジン(/api/...)で API を呼ぶ。
  // こうするとクッキーがそのまま送られ、CORS も気にしなくてよい。
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
