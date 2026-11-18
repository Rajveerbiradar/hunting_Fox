import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Prompts are read from /prompts at runtime by the scan pipeline.
  // The resume PDF is built on the server with our own font files.
  outputFileTracingIncludes: { "/api/**/*": ["./prompts/**/*", "./assets/fonts/**/*"] },
  serverExternalPackages: ["unpdf", "@react-pdf/renderer"],
};

export default nextConfig;
