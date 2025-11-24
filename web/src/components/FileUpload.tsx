import React, { useCallback, useState } from 'react';
import { Upload, X, FileSpreadsheet, File as FileIcon, FileText } from 'lucide-react';
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
                    id={`file - upload - ${label} `}
                />
                <label htmlFor={`file - upload - ${label} `} className="cursor-pointer flex flex-col items-center">
                    <Upload className="w-12 h-12 text-gray-400 mb-4" />
                    <p className="text-lg font-medium text-gray-700">Drop files here or click to upload</p>
                    <p className="text-sm text-gray-500 mt-1">
                        {accept ? `Supported formats: ${accept} ` : 'All files accepted'}
                    </p>
                </label>
            </div>

            {selectedFiles.length > 0 && (
                <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Files ({selectedFiles.length})</h4>
                    <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg">
                        <ul className="divide-y divide-gray-100">
                            {selectedFiles.map((file, index) => (
                                <li key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 text-xs">
                                    <div className="flex items-center truncate">
                                        <FileText className="w-3 h-3 text-blue-500 mr-2 flex-shrink-0" />
                                        <span className="text-gray-600 truncate max-w-[200px]">{file.name}</span>
                                        <span className="text-gray-400 ml-2">({(file.size / 1024).toFixed(1)} KB)</span>
                                    </div>
                                    <button
                                        onClick={() => removeFile(index)}
                                        className="text-gray-400 hover:text-red-500 p-1"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
