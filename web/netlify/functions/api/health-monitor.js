const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

exports.handler = async (event, context) => {
  try {
    const { date } = event.queryStringParameters || {};
    
    if (!date) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Date parameter is required' })
      };
    }

    const auth = new JWT({
      email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: SCOPES,
    });

    const drive = google.drive({ version: 'v3', auth });
    const folderId = process.env.HEALTH_MONITOR_FOLDER_ID;
    
    if (!folderId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'HEALTH_MONITOR_FOLDER_ID not configured' })
      };
    }

    // Search for the file with the specific date in the folder
    const response = await drive.files.list({
      q: `'${folderId}' in parents and name contains '${date}' and trashed = false`,
      fields: 'files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (!response.data.files || response.data.files.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No files found for the specified date' })
      };
    }

    // Get the first matching file
    const file = response.data.files[0];
    
    // Download the file content
    const fileResponse = await drive.files.get(
      { fileId: file.id, alt: 'media' },
      { responseType: 'text' }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ data: fileResponse.data })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch health monitor data' })
    };
  }
};
