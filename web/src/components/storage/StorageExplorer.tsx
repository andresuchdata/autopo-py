"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
    Trash,
    CheckSquare,
    Square,
    Files
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storageService } from '@/services/api';
import { clsx } from 'clsx';

const ITEMS_PER_PAGE = 50;

const ensureTrailingSlash = (value: string): string => {
    if (!value) return '';
    return value.endsWith('/') ? value : `${value}/`;
};

interface StorageExplorerProps {
    basePrefix: string;
    onViewFile?: (key: string) => void;
}

interface StorageItem {
    key: string;
    name: string;
    isFolder: boolean;
    size?: number;
    lastModified?: string;
}

export function StorageExplorer({ basePrefix, onViewFile }: StorageExplorerProps) {
    const normalizedBasePrefix = ensureTrailingSlash(basePrefix);
    const [currentPrefix, setCurrentPrefix] = useState<string>(normalizedBasePrefix);
    const [folders, setFolders] = useState<StorageItem[]>([]);
    const [files, setFiles] = useState<StorageItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const listRef = useRef<HTMLDivElement | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    const combinedItems = useMemo(() => [...folders, ...files], [folders, files]);
    const hasMoreFiles = Boolean(nextCursor);

    const loadFolders = useCallback(async () => {
        try {
            const data = await storageService.getPrefixes(currentPrefix);
            const folderItems = data.map((folder) => ({
                key: ensureTrailingSlash(folder.prefix),
                name: folder.name,
                isFolder: true,
            }));
            setFolders(folderItems);
        } catch (err) {
            console.error('Failed to fetch folders:', err);
            setFolders([]);
        }
    }, [currentPrefix]);

    const loadFiles = useCallback(
        async (cursorOverride?: string) => {
            const isInitial = !cursorOverride;
            if (isInitial) {
                setLoading(true);
                setError(null);
            } else {
                setLoadingMore(true);
            }

            try {
                const response = await storageService.getFiles(currentPrefix, ITEMS_PER_PAGE, cursorOverride);
                const mappedFiles: StorageItem[] = response.objects.map((obj) => {
                    const key = obj.key;
                    const relativePath =
                        currentPrefix && key.startsWith(currentPrefix) ? key.slice(currentPrefix.length) : key;
                    const name = relativePath.split('/').filter(Boolean).pop() || key;
                    return {
                        key,
                        name,
                        isFolder: false,
                        size: obj.size,
                        lastModified: obj.lastModified,
                    };
                });

                setFiles((prev) => (cursorOverride ? [...prev, ...mappedFiles] : mappedFiles));
                setNextCursor(response.nextCursor ?? null);
            } catch (err) {
                console.error('Failed to fetch files:', err);
                if (!cursorOverride) {
                    setFiles([]);
                    setNextCursor(null);
                }
                setError('Unable to load files from storage. Please try again.');
            } finally {
                if (isInitial) {
                    setLoading(false);
                } else {
                    setLoadingMore(false);
                }
            }
        },
        [currentPrefix],
    );

    const refreshCurrent = useCallback(() => {
        loadFolders();
        loadFiles();
    }, [loadFolders, loadFiles]);

    useEffect(() => {
        setCurrentPrefix(ensureTrailingSlash(basePrefix));
    }, [basePrefix]);

    useEffect(() => {
        setFolders([]);
        setFiles([]);
        setNextCursor(null);
        setSelectedKeys(new Set());
        refreshCurrent();
    }, [refreshCurrent]);

    const handleFolderClick = (prefix: string) => {
        setCurrentPrefix(ensureTrailingSlash(prefix));
    };

    const handleBack = () => {
        if (currentPrefix === normalizedBasePrefix) return;
        const trimmed = currentPrefix.replace(/\/+$/, '');
        const lastSlashIndex = trimmed.lastIndexOf('/');
        let parent = normalizedBasePrefix;
        if (lastSlashIndex >= 0) {
            parent = trimmed.slice(0, lastSlashIndex + 1);
        }

        if (!parent.startsWith(normalizedBasePrefix)) {
            parent = normalizedBasePrefix;
        }

        setCurrentPrefix(ensureTrailingSlash(parent));
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
            refreshCurrent();
        } catch (error) {
            setError(`Failed to delete ${isFolder ? 'folder' : 'file'}.`);
        }
    };

    const handleDeleteAll = async () => {
        if (!window.confirm(`Are you sure you want to delete ALL files and subfolders under ${currentPrefix}? This action cannot be undone.`)) return;
        try {
            await storageService.deletePrefix(currentPrefix);
            alert('All files in folder deleted');
            refreshCurrent();
        } catch (error) {
            setError('Failed to delete folder content.');
        }
    };

    const toggleSelect = (key: string) => {
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedKeys.size === combinedItems.length) {
            setSelectedKeys(new Set());
        } else {
            setSelectedKeys(new Set(combinedItems.map((item) => item.key)));
        }
    };

    const handleBulkDelete = async () => {
        const keysToDelete = Array.from(selectedKeys);
        if (keysToDelete.length === 0) return;

        if (!window.confirm(`Are you sure you want to delete ${keysToDelete.length} items?`)) return;

        try {
            setLoading(true);
            await storageService.bulkDeleteFiles(keysToDelete);
            setSelectedKeys(new Set());
            refreshCurrent();
            alert('Selected items deleted');
        } catch (error) {
            setError('Failed to delete selected items.');
        } finally {
            setLoading(false);
        }
    };

    const handleBulkDownload = async () => {
        const keysToDownload = Array.from(selectedKeys);
        if (keysToDownload.length === 0) return;

        try {
            setLoading(true);
            const blob = await storageService.bulkDownloadFiles(keysToDownload);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bulk_download_${new Date().getTime()}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            setError('Failed to download selected items.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const sentinel = sentinelRef.current;
        const listElement = listRef.current;
        if (!sentinel || !hasMoreFiles || !nextCursor) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && nextCursor && !loading && !loadingMore) {
                    loadFiles(nextCursor);
                }
            },
            {
                root: listElement,
                threshold: 0.1
            }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMoreFiles, loadFiles, loading, loadingMore, nextCursor]);

    const breadcrumbs = currentPrefix.substring(normalizedBasePrefix.length).split('/').filter(Boolean);

    const handleManualLoadMore = () => {
        if (nextCursor && !loadingMore) {
            loadFiles(nextCursor);
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-sm">
                    <Button variant="ghost" size="sm" onClick={() => setCurrentPrefix(normalizedBasePrefix)} className="font-semibold text-primary">
                        Root
                    </Button>
                    {breadcrumbs.map((crumb, idx) => (
                        <React.Fragment key={idx}>
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    const path = normalizedBasePrefix + breadcrumbs.slice(0, idx + 1).join('/') + '/';
                                    setCurrentPrefix(path);
                                }}
                            >
                                {crumb}
                            </Button>
                        </React.Fragment>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    {selectedKeys.size > 0 && (
                        <div className="flex items-center gap-2 mr-4 pr-4 border-r border-gray-200 dark:border-gray-800">
                            <span className="text-xs font-medium text-gray-500">
                                {selectedKeys.size} selected
                            </span>
                            <Button variant="outline" size="sm" onClick={handleBulkDownload} className="gap-2 h-8">
                                <Download className="w-3.5 h-3.5" />
                                Download Selected
                            </Button>
                            <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-2 h-8">
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete Selected
                            </Button>
                        </div>
                    )}

                    <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="gap-2 h-8">
                        {selectedKeys.size === combinedItems.length && combinedItems.length > 0 ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                        )}
                        Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={refreshCurrent} disabled={loading} title="Refresh">
                        <RefreshCcw className={clsx("w-4 h-4", loading && "animate-spin")} />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadAll} disabled={loading} className="gap-2">
                        <DownloadCloud className="w-4 h-4" />
                        Download All
                    </Button>

                    <Button variant="destructive" size="sm" onClick={handleDeleteAll} disabled={loading || currentPrefix === normalizedBasePrefix} className="gap-2">
                        <Trash className="w-4 h-4" />
                        Delete All
                    </Button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 min-h-0 overflow-auto p-2 flex flex-col gap-3" ref={listRef}>
                {error && (
                    <div className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
                        <div className="flex-1">
                            {error}
                        </div>
                        <Button variant="outline" size="sm" onClick={refreshCurrent} disabled={loading}>
                            Retry
                        </Button>
                    </div>
                )}
                {currentPrefix !== normalizedBasePrefix && (
                    <div
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-gray-500"
                        onClick={handleBack}
                    >
                        <Folder className="w-5 h-5 fill-gray-200" />
                        <span className="text-sm font-medium">..</span>
                    </div>
                )}

                {combinedItems.length === 0 && !loading ? (
                    <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                        <FolderPlus className="w-12 h-12 mb-2 opacity-20" />
                        <p className="text-sm">Folder is empty</p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {/* Table Header */}
                        <div className="flex items-center px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/20 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 shrink-0">
                            <div className="w-8 ml-2"></div>
                            <div className="flex-1 min-w-0 px-3">Name</div>
                            <div className="w-24 px-3 text-right">Size</div>
                            <div className="w-40 px-3 text-right">Updated At</div>
                            <div className="w-24"></div>
                        </div>

                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {combinedItems.map((item) => (
                                <div
                                    key={item.key}
                                    className={clsx(
                                        "group flex items-center p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors border-l-2",
                                        selectedKeys.has(item.key)
                                            ? "bg-primary/5 dark:bg-primary/10 border-primary"
                                            : "border-transparent"
                                    )}
                                >
                                    <div className="w-8 ml-2 flex items-center justify-center shrink-0">
                                        <button
                                            onClick={() => toggleSelect(item.key)}
                                            className="text-gray-400 hover:text-primary transition-colors focus:outline-none"
                                        >
                                            {selectedKeys.has(item.key) ? (
                                                <CheckSquare className="w-4 h-4 text-primary" />
                                            ) : (
                                                <Square className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>

                                    <div
                                        className="flex items-center gap-3 flex-1 min-w-0 px-3 cursor-pointer overflow-hidden"
                                        onClick={() => item.isFolder ? handleFolderClick(item.key) : onViewFile?.(item.key)}
                                    >
                                        {item.isFolder ? (
                                            <Folder className="w-4 h-4 text-blue-500/80 dark:text-blue-400 shrink-0" />
                                        ) : (
                                            <FileIcon className="w-4 h-4 text-gray-400 shrink-0" />
                                        )}
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors truncate">
                                            {item.name}
                                        </span>
                                    </div>

                                    <div className="w-24 px-3 text-right shrink-0">
                                        {!item.isFolder && item.size !== undefined && (
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                                                {item.size > 1024 * 1024
                                                    ? `${(item.size / (1024 * 1024)).toFixed(1)} MB`
                                                    : `${(item.size / 1024).toFixed(1)} KB`
                                                }
                                            </span>
                                        )}
                                    </div>

                                    <div className="w-40 px-3 text-right shrink-0">
                                        {item.lastModified && (
                                            <span className="text-[11px] text-gray-400 whitespace-nowrap">
                                                {new Date(item.lastModified).toLocaleString('id-ID', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </span>
                                        )}
                                    </div>

                                    <div className="w-24 px-3 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        {!item.isFolder && (
                                            <>
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewFile?.(item.key)} title="View Content">
                                                    <Eye className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(item.key, item.name)} title="Download">
                                                    <Download className="w-3.5 h-3.5" />
                                                </Button>
                                            </>
                                        )}

                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(item.key, item.name, item.isFolder)} title="Delete">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {hasMoreFiles && <div ref={sentinelRef} className="h-1" />}
                        </div>
                    </div>
                )}
                {loading && combinedItems.length === 0 && (
                    <div className="h-32 flex items-center justify-center text-sm text-gray-500">
                        Loading files...
                    </div>
                )}
                {hasMoreFiles && !loading && (
                    <div className="px-3 pb-3">
                        <Button variant="outline" size="sm" className="w-full" onClick={handleManualLoadMore} disabled={loadingMore}>
                            {loadingMore ? 'Loading…' : 'Load more'}
                        </Button>
                    </div>
                )}
                {loadingMore && hasMoreFiles && (
                    <div className="px-3 pb-3 text-xs text-gray-500 text-center">
                        Loading more files...
                    </div>
                )}
            </div>
        </div>
    );
}
