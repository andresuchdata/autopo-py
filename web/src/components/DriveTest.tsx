'use client';

import { useState, useRef, useEffect } from 'react';
import { useDriveFiles } from '@/hooks/useDriveFiles';
import { FiUpload, FiRefreshCw, FiTrash2, FiExternalLink, FiFile, FiAlertCircle } from 'react-icons/fi';

interface DriveFile {
  id: string;
  name: string;
  size?: string;
  modifiedTime: string;
  webViewLink: string;
}

export default function DriveTest() {
  const { files = [], loading, error, fetchFiles, uploadFile, deleteFile } = useDriveFiles();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch files on component mount
  useEffect(() => {
    const loadFiles = async () => {
      try {
        await fetchFiles();
        setLocalError(null);
      } catch (err) {
        console.error('Failed to load files:', err);
        setLocalError('Failed to load files. Please check your connection and try again.');
      }
    };
    loadFiles();
  }, [fetchFiles]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
      setLocalError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadFile) return;

    try {
      setUploading(true);
      setUploadProgress(0);
      setLocalError(null);

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      await uploadFile(selectedFile);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      setSelectedFile(null);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Refresh files list
      await fetchFiles();
    } catch (err) {
      console.error('Upload failed:', err);
      setLocalError('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 500);
    }
  };

  const handleDelete = async (fileId: string, fileName: string) => {
    if (!deleteFile) return;
    if (!window.confirm(`Are you sure you want to move "${fileName}" to trash?`)) return;

    try {
      await deleteFile(fileId);
      await fetchFiles();
    } catch (err) {
      console.error('Delete failed:', err);
      setLocalError('Failed to delete file. Please try again.');
    }
  };

  const formatFileSize = (bytes?: string) => {
    if (!bytes) return '0 B';
    const size = parseInt(bytes);
    if (isNaN(size) || size === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return `${parseFloat((size / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return 'Invalid date';
    }
  };

  // Render error state
  if (localError) {
    return (
      <div className="p-4 max-w-4xl mx-auto">
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex items-center">
            <FiAlertCircle className="text-red-500 mr-2" />
            <p className="text-red-700">{localError}</p>
          </div>
          <button
            onClick={() => {
              setLocalError(null);
              if (fetchFiles) fetchFiles();
            }}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">Google Drive Integration</h1>
      
      {/* Upload Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Upload File
            </label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
              disabled={uploading}
            />
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: {selectedFile.name} ({formatFileSize(selectedFile.size.toString())})
              </p>
            )}
          </div>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className={`px-4 py-2 rounded-md text-white font-medium flex items-center gap-2
              ${!selectedFile || uploading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {uploading ? (
              <>
                <FiRefreshCw className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <FiUpload />
                Upload
              </>
            )}
          </button>
        </div>

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-right text-sm text-gray-500 mt-1">{uploadProgress}%</p>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
          <div className="flex items-center">
            <FiAlertCircle className="text-red-500 mr-2" />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Files List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-medium">Files</h2>
          <button
            onClick={fetchFiles}
            disabled={loading}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
          >
            <FiRefreshCw className={`${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading && !files.length ? (
          <div className="p-8 text-center text-gray-500">
            <FiRefreshCw className="animate-spin mx-auto text-2xl mb-2" />
            <p>Loading files...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No files found in your Google Drive folder.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {files.map((file) => (
              <div key={file.id} className="p-4 hover:bg-gray-50 group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center min-w-0">
                    <FiFile className="text-gray-400 mr-3 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
                        <span>{formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span title={new Date(file.modifiedTime).toLocaleString()}>
                          Modified {formatDate(file.modifiedTime)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-500 hover:text-blue-600"
                      title="Open in Google Drive"
                    >
                      <FiExternalLink />
                    </a>
                    <button
                      onClick={() => handleDelete(file.id, file.name)}
                      className="p-2 text-gray-500 hover:text-red-600"
                      title="Move to trash"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}