import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'Health check successful' });
}

// This is a test route to verify API functionality
// Access it at: http://localhost:3000/api/health-check
