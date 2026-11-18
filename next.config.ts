import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Prompts are read from /prompts at runtime by the scan pipeline.
  outputFileTracingIncludes: { "/api/**/*": ["./prompts/**/*"] },
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
