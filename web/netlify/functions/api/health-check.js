const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

exports.handler = async (event, context) => {
  try {
    // Simple health check response
    const response = {
      status: 'ok',
      message: 'Health check successful',
      timestamp: new Date().toISOString(),
      // Add any additional health check logic here
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Health check error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        status: 'error',
        message: 'Health check failed',
        error: error.message 
      })
    };
  }
};
