import type { NextConfig } from "next";

const enableStaticExport = process.env.NEXT_ENABLE_STATIC_EXPORT === 'true';

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Configure server components and external packages
  experimental: {
    // @ts-ignore - This is a valid experimental option
    serverComponentsExternalPackages: ['googleapis', 'google-auth-library'],
  },

  // Configure images (must be unoptimized for static export)
  images: {
    unoptimized: enableStaticExport,
  },

  // Environment variables for client-side
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },

  reactStrictMode: true,

  ...(enableStaticExport && {
    output: 'export',
    trailingSlash: true,
    // This tells Next.js to not try to handle API routes
    // as they'll be handled by Netlify Functions during export
    skipTrailingSlashRedirect: true,
  }),
};

// Only include API routes in development
if (process.env.NODE_ENV !== 'production') {
  // @ts-ignore - We know this is valid in development
  nextConfig.api = {
    bodyParser: false,
    externalResolver: true,
  };
}

export default nextConfig;