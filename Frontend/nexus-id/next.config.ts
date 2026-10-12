import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["onnxruntime-node"], // Correct Next.js 15+ syntax
};

export default nextConfig;
