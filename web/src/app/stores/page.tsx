"use client";

import React, { useState, useEffect } from 'react';
import {
  Database,
  FileText,
  Settings,
  Layers,
  Activity,
  Archive,
  Search,
  X,
  Maximize2,
  Table as TableIcon
} from 'lucide-react';
import { Sidebar, Store } from '@/components/Sidebar';
import { StorageExplorer } from '@/components/storage/StorageExplorer';
import { DataViewer } from '@/components/DataViewer';
import { storageService } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { clsx } from 'clsx';

type Section = 'stock_health_raw' | 'stock_health_output' | 'po_snapshot_raw' | 'po_snapshot_output';

const SECTIONS: { id: Section; label: string; icon: any; prefix: string }[] = [
  { id: 'stock_health_raw', label: 'Stock Health - Raw', icon: Database, prefix: 'stock_health/raw/' },
  { id: 'stock_health_output', label: 'Stock Health - Output', icon: Archive, prefix: 'stock_health/output/' },
  { id: 'po_snapshot_raw', label: 'PO Snapshot - Raw', icon: Layers, prefix: 'po_snapshot/raw/' },
  { id: 'po_snapshot_output', label: 'PO Snapshot - Output', icon: FileText, prefix: 'po_snapshot/output/' },
];

export default function StoresPage() {
  const [activeSection, setActiveSection] = useState<Section>('stock_health_output');
  const [viewingFile, setViewingFile] = useState<{ key: string; name: string } | null>(null);
  const [fileData, setFileData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleViewFile = async (key: string) => {
    setViewingFile({ key, name: key.split('/').pop() || 'File' });
    setLoading(true);
    try {
      const content = await storageService.getFileContent(key);
      // Simple CSV parser for the preview
      const lines = content.split('\n').filter(Boolean);
      if (lines.length > 0) {
        // Detect separator (semicolon or comma)
        const header = lines[0];
        const separator = header.includes(';') ? ';' : ',';
        const headers = header.split(separator).map((h: string) => h.trim().replace(/^"|"$/g, ''));

        const data = lines.slice(1).map((line: string) => {
          const values = line.split(separator).map((v: string) => v.trim().replace(/^"|"$/g, ''));
          const row: any = {};
          headers.forEach((h: string, i: number) => {
            row[h] = values[i] || '';
          });
          return row;
        });
        setFileData(data);
      }
    } catch (error) {
      console.error('Failed to view file:', error);
      alert('Failed to load file content');
    } finally {
      setLoading(false);
    }
  };

  const currentSection = SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="flex h-screen bg-[#F8F9FC] dark:bg-gray-950 overflow-hidden">
      {/* Navigation Sidebar */}
      <div className="w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col shrink-0">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <Activity className="w-6 h-6" />
            Storage Manager
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">
            Data Pipeline
          </p>
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={clsx(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                  activeSection === section.id
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
                )}
              >
                <Icon className={clsx(
                  "w-4 h-4",
                  activeSection === section.id ? "text-white" : "text-gray-400 group-hover:text-primary"
                )} />
                {section.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-500 hover:text-primary transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-md flex items-center justify-between px-8 shrink-0">
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {currentSection?.label}
            </h2>
            <span className="text-xs text-gray-500">
              Prefix: {currentSection?.prefix}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" className="gap-2">
              <Search className="w-4 h-4" />
              Global Search
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-8">
          <div className="h-full flex flex-col gap-6">
            <div className="flex-1">
              <StorageExplorer
                key={activeSection}
                basePrefix={currentSection?.prefix || ''}
                onViewFile={handleViewFile}
              />
            </div>
          </div>
        </div>

        {/* File Viewer Dialog */}
        <Dialog open={!!viewingFile} onOpenChange={(open) => !open && setViewingFile(null)}>
          <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-6 gap-4">
            <DialogHeader className="flex flex-row items-center justify-between border-b pb-4 shrink-0">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  {viewingFile?.name}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Full Path: {viewingFile?.key}
                </p>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-hidden min-h-0 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800">
              {loading ? (
                <div className="h-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : fileData ? (
                <div className="h-full p-4">
                  <DataViewer data={fileData} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Failed to load file content
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
