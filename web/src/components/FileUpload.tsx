import React, { useCallback, useState } from 'react';
import { Upload, X, FileSpreadsheet, File as FileIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface FileUploadProps {
    onFilesSelected: (files: File[]) => void;
    accept?: string;
    multiple?: boolean;
    label?: string;
}

export function FileUpload({ onFilesSelected, accept, multiple = true, label = "Upload Files" }: FileUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const newFiles = Array.from(e.dataTransfer.files);
            setSelectedFiles(prev => multiple ? [...prev, ...newFiles] : newFiles);
            onFilesSelected(multiple ? [...selectedFiles, ...newFiles] : newFiles);
        }
    }, [multiple, onFilesSelected, selectedFiles]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            setSelectedFiles(prev => multiple ? [...prev, ...newFiles] : newFiles);
            onFilesSelected(multiple ? [...selectedFiles, ...newFiles] : newFiles);
        }
    }, [multiple, onFilesSelected, selectedFiles]);

    const removeFile = (index: number) => {
        const newFiles = selectedFiles.filter((_, i) => i !== index);
        setSelectedFiles(newFiles);
        onFilesSelected(newFiles);
    };

    return (
        <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={twMerge(
                    "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                    isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400"
                )}
            >
                <input
                    type="file"
                    className="hidden"
                    onChange={handleFileInput}
                    accept={accept}
                    multiple={multiple}
                    id={`file-upload-${label}`}
                />
                <label htmlFor={`file-upload-${label}`} className="cursor-pointer flex flex-col items-center">
                    <Upload className="w-12 h-12 text-gray-400 mb-4" />
                    <p className="text-lg font-medium text-gray-700">Drop files here or click to upload</p>
                    <p className="text-sm text-gray-500 mt-1">
                        {accept ? `Supported formats: ${accept}` : 'All files accepted'}
                    </p>
                </label>
            </div>

            {selectedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                    {selectedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm">
                            <div className="flex items-center space-x-3">
                                {file.name.endsWith('.xlsx') || file.name.endsWith('.csv') ? (
                                    <FileSpreadsheet className="w-5 h-5 text-green-600" />
                                ) : (
                                    <FileIcon className="w-5 h-5 text-gray-500" />
                                )}
                                <span className="text-sm font-medium text-gray-700 truncate max-w-xs">{file.name}</span>
                                <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
                            </div>
                            <button
                                onClick={() => removeFile(index)}
                                className="p-1 hover:bg-gray-100 rounded-full text-gray-500 hover:text-red-500 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
