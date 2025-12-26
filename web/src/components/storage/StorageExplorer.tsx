"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
    Folder,
    File as FileIcon,
    Download,
    Trash2,
    Eye,
    ChevronRight,
    RefreshCcw,
    FolderPlus,
    DownloadCloud,
    Trash
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storageService } from '@/services/api';
import { clsx } from 'clsx';


interface StorageExplorerProps {
    basePrefix: string;
    onViewFile?: (key: string) => void;
}

interface StorageItem {
    key: string;
    name: string;
    isFolder: boolean;
    size?: number;
}

export function StorageExplorer({ basePrefix, onViewFile }: StorageExplorerProps) {
    const [currentPrefix, setCurrentPrefix] = useState(basePrefix);
    const [items, setItems] = useState<StorageItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchFiles = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await storageService.getFiles(currentPrefix);
            // Process data into folders and files
            const processedItems: StorageItem[] = [];
            const folders = new Set<string>();

            data.forEach((obj: any) => {
                const relativePath = obj.Key.substring(currentPrefix.length);
                const parts = relativePath.split('/').filter(Boolean);

                if (parts.length > 1) {
                    // It's a folder
                    folders.add(parts[0]);
                } else if (parts.length === 1) {
                    // It's a file
                    processedItems.push({
                        key: obj.Key,
                        name: parts[0],
                        isFolder: false,
                        size: obj.Size
                    });
                }
            });

            const folderItems = Array.from(folders).map(name => ({
                key: currentPrefix + name + '/',
                name: name,
                isFolder: true
            }));

            setItems([...folderItems, ...processedItems]);
            setError(null);
        } catch (error) {
            console.error('Failed to fetch files:', error);
            setItems([]);
            setError('Unable to load files from storage. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [currentPrefix]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    const handleFolderClick = (prefix: string) => {
        setCurrentPrefix(prefix);
    };

    const handleBack = () => {
        if (currentPrefix === basePrefix) return;
        const parts = currentPrefix.split('/').filter(Boolean);
        parts.pop();
        const parentPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
        setCurrentPrefix(parentPrefix.startsWith(basePrefix) ? parentPrefix : basePrefix);
    };

    const handleDownload = async (key: string, name: string) => {
        try {
            const blob = await storageService.downloadFile(key);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            setError('Failed to download file. Please try again.');
        }
    };

    const handleDownloadAll = async () => {
        try {
            const blob = await storageService.downloadAll(currentPrefix);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${currentPrefix.split('/').filter(Boolean).pop() || 'files'}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            setError('Failed to download files. Please try again.');
        }
    };

    const handleDelete = async (key: string, name: string, isFolder: boolean) => {
        if (!window.confirm(`Are you sure you want to delete ${name}?${isFolder ? " This will delete all contents inside the folder." : ""} `)) return;
        try {
            if (isFolder) {
                await storageService.deletePrefix(key);
                alert('Folder and its contents deleted');
            } else {
                await storageService.deleteFile(key);
                alert('File deleted');
            }
            fetchFiles();
        } catch (error) {
            setError(`Failed to delete ${isFolder ? 'folder' : 'file'}.`);
        }
    };

    const handleDeleteAll = async () => {
        if (!window.confirm(`Are you sure you want to delete ALL files and subfolders under ${currentPrefix}? This action cannot be undone.`)) return;
        try {
            await storageService.deletePrefix(currentPrefix);
            alert('All files in folder deleted');
            fetchFiles();
        } catch (error) {
            setError('Failed to delete folder content.');
        }
    };

    const breadcrumbs = currentPrefix.substring(basePrefix.length).split('/').filter(Boolean);

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-sm">
                    <Button variant="ghost" size="sm" onClick={() => setCurrentPrefix(basePrefix)} className="font-semibold text-primary">
                        Root
                    </Button>
                    {breadcrumbs.map((crumb, idx) => (
                        <React.Fragment key={idx}>
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    const path = basePrefix + breadcrumbs.slice(0, idx + 1).join('/') + '/';
                                    setCurrentPrefix(path);
                                }}
                            >
                                {crumb}
                            </Button>
                        </React.Fragment>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchFiles} disabled={loading} title="Refresh">
                        <RefreshCcw className={clsx("w-4 h-4", loading && "animate-spin")} />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadAll} disabled={loading} className="gap-2">
                        <DownloadCloud className="w-4 h-4" />
                        Download All
                    </Button>

                    <Button variant="destructive" size="sm" onClick={handleDeleteAll} disabled={loading || currentPrefix === basePrefix} className="gap-2">
                        <Trash className="w-4 h-4" />
                        Delete All
                    </Button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto p-2 flex flex-col gap-3">
                {error && (
                    <div className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
                        <div className="flex-1">
                            {error}
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchFiles} disabled={loading}>
                            Retry
                        </Button>
                    </div>
                )}
                {currentPrefix !== basePrefix && (
                    <div
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-gray-500"
                        onClick={handleBack}
                    >
                        <Folder className="w-5 h-5 fill-gray-200" />
                        <span className="text-sm font-medium">..</span>
                    </div>
                )}

                {items.length === 0 && !loading ? (
                    <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                        <FolderPlus className="w-12 h-12 mb-2 opacity-20" />
                        <p className="text-sm">Folder is empty</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {items.map((item) => (
                            <div
                                key={item.key}
                                className="group flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                                <div
                                    className="flex items-center gap-3 flex-1 cursor-pointer"
                                    onClick={() => item.isFolder ? handleFolderClick(item.key) : onViewFile?.(item.key)}
                                >
                                    {item.isFolder ? (
                                        <Folder className="w-5 h-5 text-blue-500 fill-blue-50/50" />
                                    ) : (
                                        <FileIcon className="w-5 h-5 text-gray-400" />
                                    )}
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors">
                                            {item.name}
                                        </span>
                                        {!item.isFolder && item.size && (
                                            <span className="text-xs text-gray-400">
                                                {(item.size / 1024).toFixed(1)} KB
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!item.isFolder && (
                                        <>
                                            <Button variant="ghost" size="icon" onClick={() => onViewFile?.(item.key)} title="View Content">
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDownload(item.key, item.name)} title="Download">
                                                <Download className="w-4 h-4" />
                                            </Button>
                                        </>
                                    )}

                                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(item.key, item.name, item.isFolder)} title="Delete">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
