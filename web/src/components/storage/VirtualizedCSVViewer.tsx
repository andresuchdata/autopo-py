"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Papa from 'papaparse';
import { Loader2, AlertCircle, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clsx } from 'clsx';

interface VirtualizedCSVViewerProps {
  fileKey: string;
  fileName: string;
  onClose: () => void;
}

interface CSVRow {
  [key: string]: string;
}

export function VirtualizedCSVViewer({ fileKey, fileName, onClose }: VirtualizedCSVViewerProps) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CSVRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [isComplete, setIsComplete] = useState(false);
  const [isLoadingChunk, setIsLoadingChunk] = useState(false);
  
  const parentRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 10,
  });

  const loadCSVStream = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRows([]);
    setHeaders([]);
    setProgress({ loaded: 0, total: 0 });
    setIsComplete(false);

    abortControllerRef.current = new AbortController();

    try {
      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8080/api/v1';
      const url = `${apiUrl}/storage/stream_csv?key=${encodeURIComponent(fileKey)}&compress=true`;

      console.log('[CSV] Starting stream from:', url);

      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log('[CSV] Response received, reading stream...');
      setIsLoadingChunk(true);

      // Read the entire response as text first (browser handles gzip decompression)
      const text = await response.text();
      
      console.log('[CSV] Full text received, length:', text.length);
      setIsLoadingChunk(false);

      // Parse the complete CSV
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        chunkSize: 1024 * 100, // 100KB chunks
        chunk: (results: any, parser: any) => {
          console.log('[CSV] Chunk received:', results.data?.length || 0, 'rows');
          
          if (results.meta?.fields && headers.length === 0) {
            setHeaders(results.meta.fields);
          }
          
          if (results.data && Array.isArray(results.data)) {
            const newRows = results.data as CSVRow[];
            setRows((prev) => [...prev, ...newRows]);
            setProgress((prev) => ({ ...prev, loaded: prev.loaded + newRows.length }));
          }
        },
        complete: () => {
          console.log('[CSV] Parsing complete');
          setIsComplete(true);
          setLoading(false);
        },
        error: (error: any) => {
          console.error('[CSV] Parse error:', error);
          setError(error.message || 'Failed to parse CSV');
          setLoading(false);
        },
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Stream aborted by user');
      } else {
        console.error('CSV streaming error:', err);
        setError(err.message || 'Failed to load CSV file');
      }
      setLoading(false);
    }
  }, [fileKey]);

  useEffect(() => {
    loadCSVStream();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fileKey]);

  const handleDownload = () => {
    const apiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8080/api/v1';
    const url = `${apiUrl}/storage/download?key=${encodeURIComponent(fileKey)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {fileName}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {isLoadingChunk ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Downloading CSV data...
              </span>
            ) : isComplete ? (
              `${rows.length.toLocaleString()} rows loaded`
            ) : loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Parsing... {progress.loaded.toLocaleString()} rows
              </span>
            ) : (
              'Ready'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2">
            <Download className="w-4 h-4" />
            Download
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={loadCSVStream}>
              Retry
            </Button>
          </div>
        ) : loading && rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-gray-500">Loading CSV file...</p>
          </div>
        ) : (
          <div ref={parentRef} className="h-full overflow-auto">
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {/* Header Row */}
              <div
                className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex"
                style={{ height: '35px' }}
              >
                <div className="w-12 shrink-0 flex items-center justify-center border-r border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500">
                  #
                </div>
                {headers.map((header, idx) => (
                  <div
                    key={idx}
                    className="min-w-[150px] px-3 flex items-center border-r border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300"
                  >
                    {header}
                  </div>
                ))}
              </div>

              {/* Virtual Rows */}
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <div
                    key={virtualRow.index}
                    className={clsx(
                      'absolute top-0 left-0 w-full flex border-b border-gray-100 dark:border-gray-800',
                      virtualRow.index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-900/50'
                    )}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start + 35}px)`,
                    }}
                  >
                    <div className="w-12 shrink-0 flex items-center justify-center border-r border-gray-100 dark:border-gray-800 text-xs text-gray-400">
                      {virtualRow.index + 1}
                    </div>
                    {headers.map((header, idx) => (
                      <div
                        key={idx}
                        className="min-w-[150px] px-3 flex items-center border-r border-gray-100 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-400 truncate"
                        title={row[header]}
                      >
                        {row[header]}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Loading indicator at bottom */}
            {loading && !isComplete && rows.length > 0 && (
              <div className="sticky bottom-0 left-0 right-0 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800 p-2 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-blue-600 dark:text-blue-400">
                  Loading more rows... ({progress.loaded.toLocaleString()})
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
