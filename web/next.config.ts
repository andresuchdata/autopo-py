import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  env: {
    HEALTH_MONITOR_FOLDER_ID: process.env.HEALTH_MONITOR_FOLDER_ID,
  },
};

export default nextConfig;
