import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // In development Next.js logs every Server Function call with its arguments, which would
  // print one-time link tokens and passwords to the terminal (#49, AUTH-02 AC-13).
  logging: { serverFunctions: false },
  // AUTH-02: the set-password page carries a one-time token in its URL fragment.
  // Browsers never send fragments, but no page link should carry a referrer from it either.
  async headers() {
    return [{ source: "/set-password", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] }];
  },
};

export default nextConfig;
