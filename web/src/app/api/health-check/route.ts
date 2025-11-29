import { NextResponse } from 'next/server';

// This route is handled by Netlify Functions in production
// and will be ignored in static export

export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'Health check successful',
    timestamp: new Date().toISOString()
  });
}

// This is a test route to verify API functionality
// In development: http://localhost:3000/api/health-check
// In production: Will be handled by Netlify Functions
