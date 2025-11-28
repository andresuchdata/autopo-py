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

async function readCsvFromDrive(drive: drive_v3.Drive, fileId: string): Promise<any[]> {
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

  return new Promise((resolve) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data);
      },
      error: () => {
        resolve([]);
      }
    });
  });
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const drive = await getDriveClient();

    // Find the master_data folder
    const folderRes = await drive.files.list({
      q: "name='master_data' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name)',
    });

    const masterDataFolder = folderRes.data.files?.[0];
    if (!masterDataFolder) {
      return NextResponse.json(
        { error: 'Master data folder not found' },
        { status: 404 }
      );
    }

    // Find all CSV files in the master_data folder
    const filesRes = await drive.files.list({
      q: `'${masterDataFolder.id}' in parents and mimeType='text/csv' and trashed=false`,
      fields: 'files(id, name)',
    });

    const files = filesRes.data.files || [];
    const result: Record<string, any[]> = {
      brands: [],
      suppliers: [],
      stores: []
    };

    // Process each file
    for (const file of files) {
      if (!file.id || !file.name) continue;
      
      const data = await readCsvFromDrive(drive, file.id);
      
      if (file.name.toLowerCase().includes('brand')) {
        result.brands = data;
      } else if (file.name.toLowerCase().includes('supplier')) {
        result.suppliers = data;
      } else if (file.name.toLowerCase().includes('store')) {
        result.stores = data;
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error accessing Google Drive:', error);
    return NextResponse.json(
      { error: 'Failed to fetch master data' },
      { status: 500 }
    );
  }
}
