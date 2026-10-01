import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // AUTH-02: the set-password page carries a one-time token in its URL fragment.
  // Browsers never send fragments, but no page link should carry a referrer from it either.
  async headers() {
    return [{ source: "/set-password", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] }];
  },
};

export default nextConfig;
