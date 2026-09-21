const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ブラウザからは同一オリジン(/api/...)で API を呼ぶ。
  // こうするとクッキーがそのまま送られ、CORS も気にしなくてよい。
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
