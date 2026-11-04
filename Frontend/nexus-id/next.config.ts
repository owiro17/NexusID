import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["onnxruntime-node"],
  outputFileTracingIncludes: {
    "/api/telemetry": ["./public/models/**/*"],
    "/api/**/*": ["./public/models/**/*"],
  },
};

export default nextConfig;
