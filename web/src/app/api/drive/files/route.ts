import { NextResponse } from 'next/server';
import { listFiles } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30; // seconds

export async function GET() {
  try {
    const files = await listFiles();
    return NextResponse.json(files);
  } catch (error) {
    console.error('Error listing files:', error);
    return NextResponse.json(
      { error: 'Failed to list files', code: 'LIST_FILES_ERROR' },
      { status: 500 }
    );
  }
}