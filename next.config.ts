import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-7f7c9a19-5f5e-4348-bd7b-cf3b8f994d26.space.z.ai",
    ".space.z.ai",
  ],
};

export default nextConfig;
