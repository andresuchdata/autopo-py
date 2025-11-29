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
  const debug = searchParams.get('debug') === 'true';

  try {
    const drive = await getDriveClient();

    if (debug) console.log('Looking for health_monitor folder...');

    const folderId = process.env.HEALTH_MONITOR_FOLDER_ID;
    let healthMonitorFolderId = folderId;

    if (!healthMonitorFolderId) {
      if (debug) console.log('No folder ID configured, looking for health_monitor folder...');
      // Find the health_monitor folder by name
      const folderRes = await drive.files.list({
        q: "name='health_monitor' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id, name)',
      });

      const healthMonitorFolder = folderRes.data.files?.[0];
      if (!healthMonitorFolder) {
        const errorMsg = 'Health monitor folder not found';
        if (debug) console.error(errorMsg, { folderRes });
        return NextResponse.json(
          {
            error: errorMsg,
            ...(debug ? { debug: { folderRes: folderRes.data } } : {})
          },
          { status: 404 }
        );
      }
      healthMonitorFolderId = healthMonitorFolder.id!;
    } else {
      if (debug) console.log('Using configured folder ID:', healthMonitorFolderId);
    }

    let fileId: string | null = null;

    if (latest) {
      if (debug) console.log('Looking for latest CSV file...');

      // Get all CSV files and find the latest one
      const filesRes = await drive.files.list({
        q: `'${healthMonitorFolderId}' in parents and mimeType='text/csv' and trashed=false`,
        fields: 'files(id, name, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 5 // Increased to see more files for debugging
      });

      if (debug) console.log('Latest files found:', filesRes.data.files);
      fileId = filesRes.data.files?.[0]?.id || null;
    } else if (date) {
      if (debug) console.log(`Looking for file with date: ${date}`);

      // Try different patterns to find the file
      const patterns = [
        `name contains '${date}'`,  // Exact date in filename
        `name contains '${date.slice(2)}'`,  // YYMMDD format
        `name contains '${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}'` // YYYY-MM-DD format
      ];

      for (const pattern of patterns) {
        const query = `'${healthMonitorFolderId}' in parents and ${pattern} and mimeType='text/csv' and trashed=false`;
        if (debug) console.log('Trying query:', query);

        const filesRes = await drive.files.list({
          q: query,
          fields: 'files(id, name)',
          pageSize: 1
        });

        if (filesRes.data.files?.length) {
          fileId = filesRes.data.files[0].id;
          if (debug) console.log('Found file with pattern:', pattern, filesRes.data.files[0]);
          break;
        }
      }

      if (!fileId && debug) {
        console.log('No file found with any date pattern');
      }
    }

    if (!fileId) {
      const errorMsg = 'No matching file found';
      if (debug) console.error(errorMsg);
      return NextResponse.json(
        {
          error: errorMsg,
          ...(debug ? {
            debug: {
              date,
              latest,
              healthMonitorFolder: {
                id: healthMonitorFolderId
              }
            }
          } : {})
        },
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
    let result;
    try {
      result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      if (debug) {
        console.log('CSV parse result:', {
          dataLength: result.data.length,
          fields: result.meta.fields,
          errors: result.errors,
          sampleData: result.data.slice(0, 2) // First 2 rows for debugging
        });
      }

      return NextResponse.json({
        data: result.data,
        meta: result.meta,
        errors: result.errors,
        ...(debug ? {
          _debug: {
            fileSize: buffer.length,
            first100Chars: csvText.substring(0, 100),
            last100Chars: csvText.substring(csvText.length - 100)
          }
        } : {})
      });
    } catch (error) {
      const parseError = error as Error;
      console.error('Error parsing CSV:', parseError);
      return NextResponse.json(
        {
          error: 'Failed to parse CSV data',
          ...(debug ? {
            debug: {
              parseError: parseError.message,
              fileSize: buffer.length,
              fileStart: csvText.substring(0, 100),
              fileEnd: csvText.substring(csvText.length - 100)
            }
          } : {})
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error accessing Google Drive:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health monitor data' },
      { status: 500 }
    );
  }
}
