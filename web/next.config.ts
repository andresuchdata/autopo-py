import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Enable static export for production
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  
  // Configure server components and external packages
  experimental: {
    // @ts-ignore - This is a valid experimental option
    serverComponentsExternalPackages: ['googleapis', 'google-auth-library'],
  },
  
  // Configure images for static export
  images: {
    unoptimized: true,
  },
  
  // Environment variables for client-side
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
  
  reactStrictMode: true,
  
  // Required for static export
  trailingSlash: true,
  
  // Disable API routes in production when using static export
  ...(process.env.NODE_ENV === 'production' && {
    // This tells Next.js to not try to handle API routes
    // as they'll be handled by Netlify Functions
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