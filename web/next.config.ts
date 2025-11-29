import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: 'export',  // Required for static exports
  images: {
    unoptimized: true,  // Required for static exports
  },
  // Add basePath if your site is not at the root of the domain
  // basePath: '/your-base-path',
  env: {
    HEALTH_MONITOR_FOLDER_ID: process.env.HEALTH_MONITOR_FOLDER_ID,
    GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  },
  // Enable React strict mode (recommended)
  reactStrictMode: true,
  // Optional: Add trailing slash for better compatibility
  trailingSlash: true,
};

export default nextConfig;