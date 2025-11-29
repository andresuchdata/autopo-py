const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

async function getDriveClient() {
  const auth = new JWT({
    email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });

  return google.drive({ version: 'v3', auth });
}

exports.handler = async (event, context) => {
  try {
    const { folderId, fileId } = event.queryStringParameters || {};
    const drive = await getDriveClient();

    if (fileId) {
      // Handle file download
      const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      return {
        statusCode: 200,
        headers: {
          'Content-Type': response.headers['content-type'],
          'Content-Disposition': `attachment; filename="${fileId}"`
        },
        body: response.data
      };
    }

    if (!folderId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'folderId or fileId is required' })
      };
    }

    // List files in folder
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size)',
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response.data.files)
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to process request',
        details: error.message 
      })
    };
  }
};
