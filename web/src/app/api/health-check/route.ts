import { NextResponse } from 'next/server';

// This route is only for development
// In production, it's handled by Netlify Functions
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (process.env.NETLIFY) {
    // This should never be called in production as Netlify will handle the route
    return NextResponse.json(
      { error: 'This route should be handled by Netlify Functions' },
      { status: 500 }
    );
  }

  // Only used in development
  return NextResponse.json({ 
    status: 'ok', 
    message: 'Health check successful (development mode)',
    timestamp: new Date().toISOString()
  });
}

// This is a test route to verify API functionality
// In development: http://localhost:3000/api/health-check
// In production: Handled by Netlify Functions at /.netlify/functions/api/health-check
