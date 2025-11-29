import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  env: {
    HEALTH_MONITOR_FOLDER_ID: process.env.HEALTH_MONITOR_FOLDER_ID,
    GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  },
  reactStrictMode: true,
  // Keep trailing slash for better compatibility
  trailingSlash: true,
};

export default nextConfig;