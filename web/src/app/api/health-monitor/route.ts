import { NextResponse } from 'next/server';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { JWT } from 'google-auth-library';
import Papa from 'papaparse';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

async function getDriveClient() {
  const auth = new JWT({
    email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });

  const drive = google.drive({ version: 'v3', auth }) as drive_v3.Drive;
  return drive;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const latest = searchParams.get('latest') === 'true';

  try {
    const drive = await getDriveClient();

    // Find the health_monitor folder
    const folderRes = await drive.files.list({
      q: "name='health_monitor' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name)',
    });

    const healthMonitorFolder = folderRes.data.files?.[0];
    if (!healthMonitorFolder) {
      return NextResponse.json(
        { error: 'Health monitor folder not found' },
        { status: 404 }
      );
    }

    let fileId: string | null = null;
    
    if (latest) {
      // Get all CSV files and find the latest one
      const filesRes = await drive.files.list({
        q: `'${healthMonitorFolder.id}' in parents and mimeType='text/csv' and trashed=false`,
        fields: 'files(id, name, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 1
      });
      
      fileId = filesRes.data.files?.[0]?.id || null;
    } else if (date) {
      // Find file by date (YYYYMMDD)
      const filesRes = await drive.files.list({
        q: `'${healthMonitorFolder.id}' in parents and name contains '${date}' and mimeType='text/csv' and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 1
      });
      
      fileId = filesRes.data.files?.[0]?.id || null;
    }

    if (!fileId) {
      return NextResponse.json(
        { error: 'No matching file found' },
        { status: 404 }
      );
    }

    // Download the file content
    const response = await drive.files.get(
      { fileId, alt: 'media' } as any,
      { responseType: 'stream' } as any
    );

    const chunks: Buffer[] = [];
    const stream = response.data as unknown as Readable;

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const csvText = buffer.toString('utf-8');

    // Parse CSV to JSON
    const result = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    return NextResponse.json({
      data: result.data,
      meta: result.meta,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Error accessing Google Drive:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health monitor data' },
      { status: 500 }
    );
  }
}
