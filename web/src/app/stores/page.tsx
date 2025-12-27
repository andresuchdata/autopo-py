"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Settings,
  Activity,
  Search,
  RefreshCw
} from 'lucide-react';
import { StorageExplorer } from '@/components/storage/StorageExplorer';
import { VirtualizedCSVViewer } from '@/components/storage/VirtualizedCSVViewer';
import { storageService } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { clsx } from 'clsx';
import type { StoragePrefix } from '@/services/api';

export default function StoresPage() {
  const [folders, setFolders] = useState<StoragePrefix[]>([]);
  const [activePrefix, setActivePrefix] = useState<string>('');
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<{ key: string; name: string } | null>(null);

  const handleViewFile = (key: string) => {
    setViewingFile({ key, name: key.split('/').pop() || 'File' });
  };

  const loadRootFolders = useCallback(async () => {
    setSidebarLoading(true);
    setSidebarError(null);
    try {
      const data = await storageService.getPrefixes('');
      setFolders(data);
      setActivePrefix((prev) => prev || data[0]?.prefix || '');
    } catch (error) {
      console.error('Failed to load storage folders', error);
      setSidebarError('Unable to load folders');
      setFolders([]);
    } finally {
      setSidebarLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRootFolders();
  }, [loadRootFolders]);

  const activeFolder = folders.find((folder) => folder.prefix === activePrefix);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#F8F9FC] dark:bg-gray-950 overflow-hidden">
      {/* Navigation Sidebar */}
      <div className="w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col shrink-0">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <Activity className="w-6 h-6" />
            Storage Manager
          </h1>
        </div>

        <div className="flex-1 flex flex-col p-4 gap-2 overflow-hidden min-h-0">
          <div className="flex items-center justify-between px-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Cloud Storage
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={loadRootFolders}
              disabled={sidebarLoading}
            >
              <RefreshCw className={clsx("w-3.5 h-3.5", sidebarLoading && "animate-spin")} />
            </Button>
          </div>
          {sidebarError && (
            <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {sidebarError}
            </div>
          )}
          <div className="flex-1 overflow-y-auto pr-1 min-h-0">
            {sidebarLoading && folders.length === 0 ? (
              <div className="space-y-2 px-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
                ))}
              </div>
            ) : folders.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                No folders found under the configured cloud storage prefix.
              </div>
            ) : (
              <div className="space-y-1">
                {folders.map((folder) => (
                  <button
                    key={folder.prefix}
                    onClick={() => setActivePrefix(folder.prefix)}
                    className={clsx(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      activePrefix === folder.prefix
                        ? "bg-primary text-white shadow-md shadow-primary/20"
                        : "text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                    )}
                  >
                    <FileText className={clsx(
                      "w-4 h-4",
                      activePrefix === folder.prefix ? "text-white" : "text-gray-400"
                    )} />
                    <span className="truncate">{folder.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-500 hover:text-primary transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        <header className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-md flex items-center justify-between px-8 shrink-0">
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {activeFolder?.name || 'Root Storage'}
            </h2>
            <span className="text-xs text-gray-500">
              Prefix: {activePrefix || '/'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" className="gap-2">
              <Search className="w-4 h-4" />
              Global Search
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-8 min-h-0">
          <div className="flex flex-col gap-6 h-full min-h-0">
            {activePrefix || folders.length > 0 ? (
              <div className="flex-1 min-h-0">
                <StorageExplorer
                  key={activePrefix || 'root'}
                  basePrefix={activePrefix || ''}
                  onViewFile={handleViewFile}
                />
              </div>
            ) : (
              <div className="flex-1 rounded-xl border border-dashed border-gray-300 dark:border-gray-800 flex items-center justify-center text-sm text-gray-500">
                Select a folder to begin browsing.
              </div>
            )}
          </div>
        </div>

        {/* File Viewer Dialog */}
        <Dialog open={!!viewingFile} onOpenChange={(open) => !open && setViewingFile(null)}>
          <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 gap-0" aria-describedby={undefined}>
            <DialogTitle className="sr-only">CSV File Viewer</DialogTitle>
            {viewingFile && (
              <VirtualizedCSVViewer
                fileKey={viewingFile.key}
                fileName={viewingFile.name}
                onClose={() => setViewingFile(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
