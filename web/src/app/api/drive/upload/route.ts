import { NextResponse } from 'next/server';
import { uploadFile } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json(
        { 
          error: 'No file provided',
          code: 'MISSING_FILE'
        },
        { status: 400 }
      );
    }

    // Validate file size (e.g., 10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { 
          error: 'File is too large. Maximum size is 10MB.',
          code: 'FILE_TOO_LARGE'
        },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const result = await uploadFile(file.name, bytes, file.type);

    return NextResponse.json({
      success: true,
      file: result
    });
  } catch (error) {
    console.error('Error in POST /api/drive/upload:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to upload file',
        code: 'UPLOAD_ERROR'
      },
      { status: 500 }
    );
  }
}

// export const config = {
//   api: {
//     bodyParser: false,
//   },
// };
