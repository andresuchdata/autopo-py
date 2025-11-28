import { google, drive_v3 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { Readable } from 'stream';

// Initialize auth
const auth = new JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

// Create a singleton Drive client
let drive: drive_v3.Drive;

const getDrive = async (): Promise<drive_v3.Drive> => {
  if (!drive) {
    const authClient = await auth;
    drive = google.drive({ version: 'v3', auth: authClient });
  }
  return drive;
};

// Helper function to convert buffer to stream
const bufferToStream = (buffer: Buffer) => {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
};

export interface DriveFile {
  id: string;
  name: string;
  webViewLink: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  createdTime?: string;
}

export async function listFiles(): Promise<DriveFile[]> {
  try {
    const drive = await getDrive();
    const response = await drive.files.list({
      q: `'${process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed = false`,
      fields: 'files(id, name, webViewLink, createdTime, modifiedTime, mimeType, size)',
      orderBy: 'modifiedTime desc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    return (response.data.files || []) as DriveFile[];
  } catch (error) {
    console.error('Error listing files:', error);
    throw new Error('Failed to list files. Please try again later.');
  }
}

export async function uploadFile(
  filename: string,
  buffer: ArrayBuffer,
  mimeType = 'application/octet-stream'
): Promise<DriveFile> {
  try {
    const drive = await getDrive();
    const folderId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_ID;
    
    if (!folderId) {
      throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set in environment variables');
    }

    console.log('Uploading file to folder ID:', folderId);
    console.log('Service account email:', process.env.GOOGLE_CLIENT_EMAIL);

    // First, verify the folder is accessible
    try {
      const folder = await drive.files.get({
        fileId: folderId,
        fields: 'id,name,capabilities',
        supportsAllDrives: true
      });
      console.log('Folder access verified:', folder.data);
    } catch (error) {
      console.error('Error accessing folder:', error);
      throw new Error(`Cannot access folder ${folderId}. Please verify the folder ID and sharing permissions.`);
    }

    const fileMetadata = {
      name: filename,
      parents: [folderId],
    };

    const media = {
      mimeType,
      body: bufferToStream(Buffer.from(buffer)),
    };

    console.log('Starting file upload...');
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink, mimeType, modifiedTime, size, createdTime',
      supportsAllDrives: true,
      supportsTeamDrives: true,
    });

    console.log('Upload successful:', response.data);
    return response.data as DriveFile;

  } catch (err) {
    const theErr = err as any;

    console.error('Detailed upload error:', {
      message: theErr.message,
      code: theErr.code,
      errors: theErr.errors,
      response: theErr.response?.data
    });
    throw new Error(`Upload failed: ${theErr.message}`);
  }
}

export async function deleteFile(fileId: string): Promise<{ success: boolean }> {
  try {
    const drive = await getDrive();
    await drive.files.update({
      fileId: fileId,
      requestBody: {
        trashed: true
      }
    });
    return { success: true };
  } catch (error) {
    console.error('Error moving file to trash:', error);
    throw new Error('Failed to delete file. Please try again.');
  }
}