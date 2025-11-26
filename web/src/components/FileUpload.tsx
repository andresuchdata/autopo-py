import React, { useCallback } from 'react';
import { Upload, X, FileSpreadsheet, Store, Users } from 'lucide-react';
import { clsx } from 'clsx';

interface FileUploadProps {
    poFiles: File[];
    onPoFilesChange: (files: File[]) => void;
    supplierFile: File | null;
    onSupplierFileChange: (file: File | null) => void;
    contributionFile: File | null;
    onContributionFileChange: (file: File | null) => void;
}

export function FileUpload({
    poFiles,
    onPoFilesChange,
    supplierFile,
    onSupplierFileChange,
    contributionFile,
    onContributionFileChange
}: FileUploadProps) {
    // Store Files Handlers
    const handlePoFilesDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const newFiles = Array.from(e.dataTransfer.files);
            onPoFilesChange([...poFiles, ...newFiles]);
        }
    }, [poFiles, onPoFilesChange]);

    const handlePoFilesInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            onPoFilesChange([...poFiles, ...newFiles]);
        }
    }, [poFiles, onPoFilesChange]);

    const removePoFile = (index?: number) => {
        if (index !== undefined) {
            onPoFilesChange(poFiles.filter((_, i) => i !== index));
        }
    };

    // Supplier File Handlers
    const handleSupplierFileDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onSupplierFileChange(e.dataTransfer.files[0]);
        }
    }, [onSupplierFileChange]);

    const handleSupplierFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onSupplierFileChange(e.target.files[0]);
        }
    }, [onSupplierFileChange]);

    // Contribution File Handlers
    const handleContributionFileDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onContributionFileChange(e.dataTransfer.files[0]);
        }
    }, [onContributionFileChange]);

    const handleContributionFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onContributionFileChange(e.target.files[0]);
        }
    }, [onContributionFileChange]);

    const UploadSection = ({
        title,
        icon: Icon,
        files,
        onDrop,
        onInput,
        onRemove,
        multiple = false,
        id,
        color = "blue"
    }: {
        title: string;
        icon: any;
        files: File | File[] | null;
        onDrop: (e: React.DragEvent) => void;
        onInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
        onRemove?: (index?: number) => void;
        multiple?: boolean;
        id: string;
        color?: "blue" | "purple" | "green";
    }) => {
        const [isDragging, setIsDragging] = React.useState(false);
        const fileArray = multiple ? (files as File[] || []) : (files ? [files as File] : []);

        const colorClasses = {
            blue: {
                border: "border-blue-500 bg-blue-50",
                text: "text-blue-600",
                icon: "text-blue-500"
            },
            purple: {
                border: "border-purple-500 bg-purple-50",
                text: "text-purple-600",
                icon: "text-purple-500"
            },
            green: {
                border: "border-green-500 bg-green-50",
                text: "text-green-600",
                icon: "text-green-500"
            }
        };

        return (
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-3">
                    <Icon className={clsx("w-5 h-5", colorClasses[color].icon)} />
                    <label className="text-sm font-semibold text-gray-800">{title}</label>
                </div>
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={(e) => { setIsDragging(false); onDrop(e); }}
                    className={clsx(
                        "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all",
                        isDragging ? colorClasses[color].border : "border-gray-300 hover:border-gray-400"
                    )}
                >
                    <input
                        type="file"
                        className="hidden"
                        onChange={onInput}
                        accept=".xlsx,.xls,.csv"
                        multiple={multiple}
                        id={id}
                    />
                    <label htmlFor={id} className="cursor-pointer flex flex-col items-center">
                        <Upload className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="text-sm font-medium text-gray-700">Drop {multiple ? 'files' : 'file'} here</p>
                        <p className="text-xs text-gray-500 mt-1">or click to browse</p>
                    </label>
                </div>

                {fileArray.length > 0 && (
                    <div className="mt-3">
                        <p className="text-xs font-medium text-gray-600 mb-2">
                            {multiple ? `${fileArray.length} file(s) selected` : 'Selected file'}
                        </p>
                        <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50">
                            <ul className="divide-y divide-gray-200">
                                {fileArray.map((file, index) => (
                                    <li key={index} className="flex items-center justify-between p-2 hover:bg-white text-xs">
                                        <div className="flex items-center truncate flex-1 min-w-0">
                                            <FileSpreadsheet className={clsx("w-3 h-3 mr-2 flex-shrink-0", colorClasses[color].icon)} />
                                            <span className="text-gray-700 truncate">{file.name}</span>
                                        </div>
                                        {onRemove && (
                                            <button
                                                onClick={() => multiple ? onRemove(index) : onRemove()}
                                                className="text-gray-400 hover:text-red-500 p-1 ml-2 flex-shrink-0"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-4">
                <UploadSection
                    title="Store Files (PO)"
                    icon={Store}
                    files={poFiles}
                    onDrop={handlePoFilesDrop}
                    onInput={handlePoFilesInput}
                    onRemove={removePoFile}
                    multiple={true}
                    id="po-files-upload"
                    color="blue"
                />
                <UploadSection
                    title="Supplier Data"
                    icon={Users}
                    files={supplierFile}
                    onDrop={handleSupplierFileDrop}
                    onInput={handleSupplierFileInput}
                    onRemove={() => onSupplierFileChange(null)}
                    multiple={false}
                    id="supplier-file-upload"
                    color="purple"
                />
                <UploadSection
                    title="Contribution Data"
                    icon={FileSpreadsheet}
                    files={contributionFile}
                    onDrop={handleContributionFileDrop}
                    onInput={handleContributionFileInput}
                    onRemove={() => onContributionFileChange(null)}
                    multiple={false}
                    id="contribution-file-upload"
                    color="green"
                />
            </div>
        </div>
    );
}
