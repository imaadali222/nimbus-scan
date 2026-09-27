import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    reactStrictMode: true,
    // Prevent local `next build` and `next dev` from corrupting each other's chunk manifests.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"
  };
}
