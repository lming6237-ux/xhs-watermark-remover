import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.xhscdn.com',
      },
      {
        protocol: 'http',
        hostname: '**.xhscdn.com',
      }
    ],
  },
  allowedDevOrigins: [
    'run-agent-69e34ae1a3c99af4f8bb2537-mo44btvd-preview.agent-sandbox-my-b1-gw.trae.ai',
    'run-agent-69e34ae1a3c99af4f8bb2537-mo4b6qyz-preview.agent-sandbox-my-b1-gw.trae.ai'
  ],
};

export default nextConfig;
