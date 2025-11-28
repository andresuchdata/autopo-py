import { NextResponse } from 'next/server';
import { google, drive_v3 } from 'googleapis';
import { JWT } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

export async function GET() {
  try {
    // Initialize auth
    const auth = new JWT({
      email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: SCOPES,
    });

    const drive = google.drive({ version: 'v3', auth });

    // Test listing root directory
    const res = await drive.files.list({
      pageSize: 10,
      fields: 'files(id, name, mimeType)',
    });

    return NextResponse.json({
      success: true,
      files: res.data.files,
      folderId: process.env.NEXT_PUBLIC_HEALTH_MONITOR_FOLDER_ID,
    });
  } catch (error: any) {
    console.error('Test Drive Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        env: {
          hasClientEmail: !!process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
          hasPrivateKey: !!process.env.GOOGLE_DRIVE_PRIVATE_KEY,
          folderId: process.env.NEXT_PUBLIC_HEALTH_MONITOR_FOLDER_ID,
        }
      },
      { status: 500 }
    );
  }
}
