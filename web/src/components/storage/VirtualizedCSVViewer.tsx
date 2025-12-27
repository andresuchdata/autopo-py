"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Papa from 'papaparse';
import { Loader2, AlertCircle, Download, X, ArrowUpDown, ArrowUp, ArrowDown, Filter, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clsx } from 'clsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface VirtualizedCSVViewerProps {
  fileKey: string;
  fileName: string;
  onClose: () => void;
}

interface CSVRow {
  [key: string]: string;
}

type SortDirection = 'asc' | 'desc' | null;

export function VirtualizedCSVViewer({ fileKey, fileName, onClose }: VirtualizedCSVViewerProps) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [isComplete, setIsComplete] = useState(false);
  const [isLoadingChunk, setIsLoadingChunk] = useState(false);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [viewIndices, setViewIndices] = useState<number[] | null>(null);
  
  const parentRef = useRef<HTMLDivElement>(null);
  const papaParserRef = useRef<Papa.Parser | null>(null);
  const rowsRef = useRef<CSVRow[]>([]);
  const uniqueValuesRef = useRef<Record<string, Set<string>>>({});
  const loadedCountRef = useRef(0);
  const rafScheduledRef = useRef(false);
  const headersRef = useRef<string[]>([]);
  const viewRecalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(false);

  const hasActiveFilters = useMemo(() => {
    return Object.values(columnFilters).some((s) => s && s.size > 0);
  }, [columnFilters]);

  const shouldUseViewIndices = useMemo(() => {
    return hasActiveFilters || (!!sortColumn && !!sortDirection);
  }, [hasActiveFilters, sortColumn, sortDirection]);

  const loadCSVStream = useCallback(async () => {
    // Prevent double requests (React Strict Mode / fast remount)
    if (isLoadingRef.current) {
      console.log('[CSV] Already loading, skipping duplicate request');
      return;
    }
    isLoadingRef.current = true;

    setLoading(true);
    setError(null);
    setHeaders([]);
    setRowCount(0);
    setProgress({ loaded: 0, total: 0 });
    setIsComplete(false);
    setIsLoadingChunk(false);
    setViewIndices(null);

    rowsRef.current = [];
    uniqueValuesRef.current = {};
    loadedCountRef.current = 0;

    if (papaParserRef.current) {
      try {
        papaParserRef.current.abort();
      } catch {
        // ignore
      }
      papaParserRef.current = null;
    }
    headersRef.current = [];

    try {
      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8080/api/v1';
      const url = `${apiUrl}/storage/stream_csv?key=${encodeURIComponent(fileKey)}&compress=true`;

      setIsLoadingChunk(true);

      // Parse progressively from URL in a worker to keep main thread responsive.
      Papa.parse(url, {
        download: true,
        worker: true,
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        chunkSize: 1024 * 256,
        chunk: (results: any, parser: any) => {
          papaParserRef.current = parser;

          if (results.meta?.fields && results.meta.fields.length > 0 && headersRef.current.length === 0) {
            headersRef.current = results.meta.fields;
            setHeaders(results.meta.fields);
          }

          if (results.data && Array.isArray(results.data) && results.data.length > 0) {
            const incoming = results.data as CSVRow[];

            // Incremental unique-values (for Excel-like filters) without rescanning.
            const uniq = uniqueValuesRef.current;
            for (const r of incoming) {
              for (const k of Object.keys(r)) {
                const v = r[k];
                if (v === undefined || v === null || v === '') continue;
                if (!uniq[k]) uniq[k] = new Set<string>();
                uniq[k].add(String(v));
              }
            }

            rowsRef.current.push(...incoming);
            loadedCountRef.current += incoming.length;

            if (!rafScheduledRef.current) {
              rafScheduledRef.current = true;
              requestAnimationFrame(() => {
                rafScheduledRef.current = false;
                setRowCount(rowsRef.current.length);
                setProgress((prev) => ({ ...prev, loaded: loadedCountRef.current }));
              });
            }
          }
        },
        complete: () => {
          isLoadingRef.current = false;
          setIsLoadingChunk(false);
          setRowCount(rowsRef.current.length);
          setProgress((prev) => ({ ...prev, loaded: rowsRef.current.length }));
          setIsComplete(true);
          setLoading(false);
        },
        error: (err: any) => {
          isLoadingRef.current = false;
          setIsLoadingChunk(false);
          setError(err?.message || 'Failed to parse CSV');
          setLoading(false);
        },
      });
    } catch (err: any) {
      isLoadingRef.current = false;
      if (err.name === 'AbortError') {
        console.log('Stream aborted by user');
      } else {
        console.error('CSV streaming error:', err);
        setError(err.message || 'Failed to load CSV file');
      }
      setIsLoadingChunk(false);
      setLoading(false);
    }
  }, [fileKey]);

  useEffect(() => {
    loadCSVStream();

    return () => {
      isLoadingRef.current = false;
      if (papaParserRef.current) {
        try {
          papaParserRef.current.abort();
        } catch {
          // ignore
        }
        papaParserRef.current = null;
      }
    };
  }, [fileKey]);

  // Initialize column widths when headers are set
  useEffect(() => {
    if (headers.length > 0 && Object.keys(columnWidths).length === 0) {
      const initialWidths: Record<string, number> = {};
      headers.forEach(header => {
        initialWidths[header] = 200; // Default width
      });
      setColumnWidths(initialWidths);
    }
  }, [headers, columnWidths]);

  // Get unique values for each column
  const getUniqueValues = useCallback((columnName: string): string[] => {
    const set = uniqueValuesRef.current[columnName];
    if (!set) return [];
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, []);

  // Handle sorting
  const handleSort = useCallback((columnName: string) => {
    if (sortColumn === columnName) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(columnName);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Handle filter toggle
  const handleFilterToggle = useCallback((columnName: string, value: string) => {
    setColumnFilters(prev => {
      const newFilters = { ...prev };
      if (!newFilters[columnName]) {
        newFilters[columnName] = new Set();
      }
      const columnFilter = new Set(newFilters[columnName]);
      
      if (columnFilter.has(value)) {
        columnFilter.delete(value);
      } else {
        columnFilter.add(value);
      }
      
      newFilters[columnName] = columnFilter;
      return newFilters;
    });
  }, []);

  // Handle column width change
  const handleColumnResize = useCallback((columnName: string, delta: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnName]: Math.max(100, (prev[columnName] || 200) + delta)
    }));
  }, []);

  const recalcViewIndices = useCallback(() => {
    if (!shouldUseViewIndices) {
      setViewIndices(null);
      return;
    }

    const base = rowsRef.current;
    const indices: number[] = [];

    // Build indices once (cheap); filters/sort act on indices.
    for (let i = 0; i < base.length; i++) {
      indices.push(i);
    }

    // Filters: keep only included values.
    if (hasActiveFilters) {
      const filterEntries = Object.entries(columnFilters).filter(([, set]) => set && set.size > 0);
      if (filterEntries.length > 0) {
        const filtered: number[] = [];
        for (const idx of indices) {
          const r = base[idx];
          let ok = true;
          for (const [col, set] of filterEntries) {
            const v = r[col];
            if (!set.has(String(v ?? ''))) {
              ok = false;
              break;
            }
          }
          if (ok) filtered.push(idx);
        }
        indices.length = 0;
        indices.push(...filtered);
      }
    }

    // Sort: stable-ish by mapping values.
    if (sortColumn && sortDirection) {
      const col = sortColumn;
      const dir = sortDirection;
      indices.sort((ia, ib) => {
        const aVal = String(base[ia]?.[col] ?? '');
        const bVal = String(base[ib]?.[col] ?? '');
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
        return dir === 'asc' ? cmp : -cmp;
      });
    }

    setViewIndices(indices);
  }, [shouldUseViewIndices, hasActiveFilters, columnFilters, sortColumn, sortDirection]);

  useEffect(() => {
    // Sorting/filtering can be expensive; during streaming we debounce and schedule
    // the recompute off the hot path.
    if (!shouldUseViewIndices) {
      if (viewIndices !== null) setViewIndices(null);
      return;
    }

    if (viewRecalcTimerRef.current) {
      clearTimeout(viewRecalcTimerRef.current);
    }

    viewRecalcTimerRef.current = setTimeout(() => {
      // Prefer idle time if available.
      const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: any) => number);
      if (ric) {
        ric(() => recalcViewIndices(), { timeout: 500 });
      } else {
        recalcViewIndices();
      }
    }, 120);

    return () => {
      if (viewRecalcTimerRef.current) {
        clearTimeout(viewRecalcTimerRef.current);
        viewRecalcTimerRef.current = null;
      }
    };
  }, [recalcViewIndices, rowCount, shouldUseViewIndices, viewIndices]);

  const viewCount = viewIndices ? viewIndices.length : rowCount;

  const filteredRowVirtualizer = useVirtualizer({
    count: viewCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 10,
  });

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
              <span>
                {rowCount.toLocaleString()} rows loaded
                {viewCount !== rowCount && (
                  <span className="text-blue-600 dark:text-blue-400 ml-2">
                    ({viewCount.toLocaleString()} filtered)
                  </span>
                )}
              </span>
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
        ) : loading && rowCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-gray-500">Loading CSV file...</p>
          </div>
        ) : (
          <div ref={parentRef} className="h-full overflow-auto">
            <div
              style={{
                height: `${filteredRowVirtualizer.getTotalSize()}px`,
                width: 'fit-content',
                minWidth: '100%',
                position: 'relative',
              }}
            >
              {/* Header Row */}
              <div
                className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800 border-b-2 border-gray-300 dark:border-gray-600 flex"
                style={{ height: '50px' }}
              >
                <div className="w-12 shrink-0 flex items-center justify-center border-r border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500">
                  #
                </div>
                {headers.map((header, idx) => {
                  const width = columnWidths[header] || 200;
                  const activeFilter = columnFilters[header];
                  const hasActiveFilter = activeFilter && activeFilter.size > 0;
                  
                  return (
                    <div
                      key={idx}
                      className="shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col"
                      style={{ width: `${width}px`, minWidth: '100px' }}
                    >
                      <div className="flex items-center justify-between px-2 py-1 gap-1">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate flex-1" title={header}>
                          {header}
                        </span>
                        <div className="flex items-center gap-0.5">
                          {/* Sort Button */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleSort(header)}
                          >
                            {sortColumn === header ? (
                              sortDirection === 'asc' ? (
                                <ArrowUp className="w-3 h-3 text-blue-600" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-blue-600" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-gray-400" />
                            )}
                          </Button>
                          
                          {/* Filter Dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={clsx("h-6 w-6", hasActiveFilter && "text-blue-600")}
                              >
                                <Filter className="w-3 h-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
                              {getUniqueValues(header).map((value) => (
                                <DropdownMenuCheckboxItem
                                  key={value}
                                  checked={!hasActiveFilter || activeFilter.has(value)}
                                  onCheckedChange={() => handleFilterToggle(header, value)}
                                >
                                  <span className="truncate" title={value}>{value || '(empty)'}</span>
                                </DropdownMenuCheckboxItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          
                          {/* Resize Buttons */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleColumnResize(header, -50)}
                          >
                            <Minimize2 className="w-3 h-3 text-gray-400" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleColumnResize(header, 50)}
                          >
                            <Maximize2 className="w-3 h-3 text-gray-400" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Virtual Rows */}
              {filteredRowVirtualizer.getVirtualItems().map((virtualRow) => {
                const realIndex = viewIndices ? viewIndices[virtualRow.index] : virtualRow.index;
                const row = rowsRef.current[realIndex];
                const isEven = virtualRow.index % 2 === 0;
                
                return (
                  <div
                    key={virtualRow.index}
                    className="absolute top-0 left-0 flex border-b border-gray-100 dark:border-gray-800"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start + 50}px)`,
                      width: 'fit-content',
                      minWidth: '100%',
                      backgroundColor: isEven 
                        ? 'rgb(255 255 255 / 1)' 
                        : 'rgb(249 250 251 / 1)',
                    }}
                  >
                    <div className="w-12 shrink-0 flex items-center justify-center border-r border-gray-100 dark:border-gray-800 text-xs text-gray-400">
                      {virtualRow.index + 1}
                    </div>
                    {headers.map((header, idx) => {
                      const width = columnWidths[header] || 200;
                      return (
                        <div
                          key={idx}
                          className="shrink-0 px-3 flex items-center border-r border-gray-100 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-400 truncate"
                          style={{ width: `${width}px`, minWidth: '100px' }}
                          title={row?.[header]}
                        >
                          {row?.[header]}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Loading indicator at bottom */}
            {loading && !isComplete && rowCount > 0 && (
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
