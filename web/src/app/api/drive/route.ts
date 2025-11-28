import { NextResponse } from 'next/server';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { JWT } from 'google-auth-library';

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
  const folderId = searchParams.get('folderId');
  const fileId = searchParams.get('fileId');
  const folderPath = searchParams.get('path');

  try {
    const drive = await getDriveClient();

    // If file ID is provided, download the file
    if (fileId) {
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
      return new Response(buffer, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename=data.csv',
        },
      });
    }

    // If folder path is provided, find the folder and list its contents
    if (folderPath) {
      const folders = folderPath.split('/').filter(Boolean);
      let currentFolderId = 'root';
      
      // Navigate through the folder structure
      for (const folder of folders) {
        const res = await drive.files.list({
          q: `'${currentFolderId}' in parents and name='${folder}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id, name)',
        });
        
        if (!res.data.files?.length) {
          return NextResponse.json(
            { error: `Folder not found: ${folder}` },
            { status: 404 }
          );
        }
        
        currentFolderId = res.data.files[0].id!;
      }

      // List files in the target folder
      const res = await drive.files.list({
        q: `'${currentFolderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, modifiedTime, size)',
      });

      return NextResponse.json(res.data.files);
    }

    // If folder ID is provided, list its contents
    if (folderId) {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, modifiedTime, size)',
      });
      return NextResponse.json(res.data.files);
    }

    // If no ID is provided, list all files in the root
    const res = await drive.files.list({
      q: "'root' in parents and trashed=false",
      fields: 'files(id, name, mimeType, modifiedTime, size)',
    });

    return NextResponse.json(res.data.files);
  } catch (error) {
    console.error('Error accessing Google Drive:', error);
    return NextResponse.json(
      { error: 'Failed to access Google Drive' },
      { status: 500 }
    );
  }
}
