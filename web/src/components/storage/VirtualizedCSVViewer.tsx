"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// Module-level map to track active loads per fileKey (survives React Strict Mode remounts)
const activeLoads = new Map<string, boolean>();
import { useVirtualizer } from '@tanstack/react-virtual';
import Papa from 'papaparse';
import { Loader2, AlertCircle, Download, X, ArrowUpDown, ArrowUp, ArrowDown, Filter, Maximize2, Minimize2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clsx } from 'clsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

interface VirtualizedCSVViewerProps {
  fileKey: string;
  fileName: string;
  onClose: () => void;
}

interface CSVRow {
  [key: string]: string;
}

type SortDirection = 'asc' | 'desc' | null;

// Memoized Cell Component to reduce re-renders
const MemoizedCell = React.memo(({
  value,
  width
}: {
  value: string;
  width: number;
}) => (
  <div
    className="shrink-0 px-3 flex items-center border-r border-gray-100 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-400 truncate h-full"
    style={{ width: `${width}px`, minWidth: '100px' }}
    title={value}
  >
    {value}
  </div>
));

MemoizedCell.displayName = "MemoizedCell";

// Memoized Row Component
const MemoizedRow = React.memo(({
  virtualRow,
  row,
  headers,
  columnWidths,
  columnItems,
  rowNumber
}: {
  virtualRow: any;
  row: CSVRow | undefined;
  headers: string[];
  columnWidths: Record<string, number>;
  columnItems: any[];
  rowNumber: number;
}) => {
  const isEven = rowNumber % 2 === 0;

  return (
    <div
      className="absolute top-0 left-0 flex border-b border-gray-100 dark:border-gray-800"
      style={{
        height: `${virtualRow.size}px`,
        transform: `translateY(${virtualRow.start}px)`,
        width: 'fit-content',
        minWidth: '100%',
        backgroundColor: isEven
          ? 'rgb(255 255 255 / 1)'
          : 'rgb(249 250 251 / 1)',
      }}
    >
      <div className="w-12 shrink-0 flex items-center justify-center border-r border-gray-100 dark:border-gray-800 text-xs text-gray-400 sticky left-0 z-10 bg-inherit shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
        {rowNumber}
      </div>

      {/* Horizontally virtualized cells */}
      <div className="relative flex h-full">
        {columnItems.map((virtualCol) => {
          const header = headers[virtualCol.index];
          return (
            <div
              key={virtualCol.key}
              className="absolute top-0 h-full flex"
              style={{
                width: `${virtualCol.size}px`,
                transform: `translateX(${virtualCol.start}px)`,
              }}
            >
              <MemoizedCell
                value={row?.[header] || ''}
                width={virtualCol.size}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

MemoizedRow.displayName = "MemoizedRow";

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
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({});
  const [showFullFile, setShowFullFile] = useState(false);
  const [hasExceededLimit, setHasExceededLimit] = useState(false);

  const BATCH_SIZE = 200;
  const lastBatchCountRef = useRef(0);
  const [isPaused, setIsPaused] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);
  const papaParserRef = useRef<Papa.Parser | null>(null);
  const rowsRef = useRef<CSVRow[]>([]);
  const uniqueValuesRef = useRef<Record<string, Set<string>>>({});
  const loadedCountRef = useRef(0);
  const rafScheduledRef = useRef(false);
  const lastUpdateRowCountRef = useRef(0);
  const headersRef = useRef<string[]>([]);
  const viewRecalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [calculatingFilters, setCalculatingFilters] = useState<string | null>(null);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [stagedFilters, setStagedFilters] = useState<Record<string, Set<string>>>({});

  const resizingRef = useRef<{
    column: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const hasActiveFilters = useMemo(() => {
    return Object.values(columnFilters).some((s) => s && s.size > 0);
  }, [columnFilters]);

  const shouldUseViewIndices = useMemo(() => {
    return hasActiveFilters || (!!sortColumn && !!sortDirection);
  }, [hasActiveFilters, sortColumn, sortDirection]);

  const loadCSVStream = useCallback(async () => {
    if (activeLoads.get(fileKey)) return;
    activeLoads.set(fileKey, true);

    setLoading(true);
    setError(null);
    setHeaders([]);
    setRowCount(0);
    setProgress({ loaded: 0, total: 0 });
    setIsComplete(false);
    setIsLoadingChunk(false);
    setViewIndices(null);
    lastBatchCountRef.current = 0;
    setIsPaused(false);

    rowsRef.current = [];
    uniqueValuesRef.current = {};
    loadedCountRef.current = 0;
    setHasExceededLimit(false);

    if (papaParserRef.current) {
      try { papaParserRef.current.abort(); } catch { }
      papaParserRef.current = null;
    }
    headersRef.current = [];

    try {
      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8080/api/v1';
      const url = `${apiUrl}/storage/stream_csv?key=${encodeURIComponent(fileKey)}`;

      setIsLoadingChunk(true);

      Papa.parse(url, {
        download: true,
        worker: true,
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        chunkSize: 1024 * 512,
        chunk: (results: any, parser: any) => {
          papaParserRef.current = parser;

          if (results.meta?.fields && results.meta.fields.length > 0 && headersRef.current.length === 0) {
            headersRef.current = results.meta.fields;
            setHeaders(results.meta.fields);
          }

          if (results.data && Array.isArray(results.data) && results.data.length > 0) {
            const incoming = results.data as CSVRow[];
            rowsRef.current.push(...incoming);
            const currentTotal = rowsRef.current.length;
            loadedCountRef.current = currentTotal;

            // Batch streaming: pause every BATCH_SIZE rows
            if (!showFullFile && currentTotal - lastBatchCountRef.current >= BATCH_SIZE) {
              parser.pause();
              setIsPaused(true);
              lastBatchCountRef.current = currentTotal;
            }

            // Only update row count every 100 rows (more frequent for batch feedback)
            const shouldUpdateUI = currentTotal - lastUpdateRowCountRef.current >= 100 || currentTotal < 50;

            if (shouldUpdateUI && !rafScheduledRef.current) {
              rafScheduledRef.current = true;
              requestAnimationFrame(() => {
                rafScheduledRef.current = false;
                setRowCount(rowsRef.current.length);
                lastUpdateRowCountRef.current = rowsRef.current.length;
                setProgress((prev) => ({ ...prev, loaded: loadedCountRef.current }));
              });
            }
          }
        },
        complete: () => {
          activeLoads.delete(fileKey);
          setIsLoadingChunk(false);
          setRowCount(rowsRef.current.length);
          setProgress((prev) => ({ ...prev, loaded: rowsRef.current.length }));
          setIsComplete(true);
          setLoading(false);
        },
        error: (err: any) => {
          activeLoads.delete(fileKey);
          setIsLoadingChunk(false);
          setError(err?.message || 'Failed to parse CSV');
          setLoading(false);
        },
      });
    } catch (err: any) {
      activeLoads.delete(fileKey);
      setIsLoadingChunk(false);
      setLoading(false);
      setError(err.message || 'Failed to load CSV file');
    }
  }, [fileKey, showFullFile]);

  useEffect(() => {
    loadCSVStream();
    return () => {
      if (papaParserRef.current) {
        try { papaParserRef.current.abort(); } catch { }
        papaParserRef.current = null;
      }
      setTimeout(() => {
        if (!document.querySelector(`[data-csv-viewer="${fileKey}"]`)) {
          activeLoads.delete(fileKey);
        }
      }, 100);
    };
  }, [fileKey, loadCSVStream]);

  useEffect(() => {
    if (headers.length > 0 && Object.keys(columnWidths).length === 0) {
      const initialWidths: Record<string, number> = {};
      headers.forEach(header => {
        initialWidths[header] = 200;
      });
      setColumnWidths(initialWidths);
    }
  }, [headers, columnWidths]);

  const handleSort = useCallback((columnName: string) => {
    setSortColumn(prev => {
      if (prev === columnName) {
        if (sortDirection === 'asc') {
          setSortDirection('desc');
          return columnName;
        }
        setSortDirection(null);
        return null;
      }
      setSortDirection('asc');
      return columnName;
    });
  }, [sortDirection]);

  const handleFilterToggle = useCallback((columnName: string, value: string) => {
    setColumnFilters(prev => {
      const current = prev[columnName] ? new Set(prev[columnName]) : new Set<string>();
      if (current.has(value)) current.delete(value);
      else current.add(value);
      return { ...prev, [columnName]: current };
    });
  }, []);

  const handleColumnResize = useCallback((columnName: string, delta: number) => {
    setColumnWidths(prev => {
      const next = {
        ...prev,
        [columnName]: Math.max(100, (prev[columnName] || 200) + delta)
      };

      return next;
    });
  }, []);

  const startResize = useCallback((e: React.MouseEvent, columnName: string) => {
    e.preventDefault();
    e.stopPropagation();

    resizingRef.current = {
      column: columnName,
      startX: e.clientX,
      startWidth: columnWidths[columnName] || 200,
    };
    setResizingColumn(columnName);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = moveEvent.clientX - resizingRef.current.startX;
      handleColumnResize(resizingRef.current.column, delta);
      // Update startX/startWidth for continuous resize
      resizingRef.current.startX = moveEvent.clientX;
      resizingRef.current.startWidth = Math.max(100, resizingRef.current.startWidth + delta);
    };

    const onMouseUp = () => {
      resizingRef.current = null;
      setResizingColumn(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [columnWidths, handleColumnResize]);

  const handleApplyFilter = useCallback((header: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [header]: stagedFilters[header] || new Set()
    }));
  }, [stagedFilters]);

  const handleClearFilter = useCallback((header: string) => {
    const nextStaged = { ...stagedFilters };
    delete nextStaged[header];
    setStagedFilters(nextStaged);
    setColumnFilters(prev => ({
      ...prev,
      [header]: new Set()
    }));
  }, [stagedFilters]);

  const handleToggleStagedFilter = useCallback((header: string, value: string) => {
    setStagedFilters(prev => {
      const current = prev[header] ? new Set(prev[header]) : new Set(columnFilters[header] || []);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      return { ...prev, [header]: current };
    });
  }, [columnFilters]);

  const recalcViewIndices = useCallback(() => {
    if (!shouldUseViewIndices) {
      setViewIndices(null);
      return;
    }

    const base = rowsRef.current;
    let indices = base.map((_, i) => i);

    if (hasActiveFilters) {
      const filterEntries = Object.entries(columnFilters).filter(([, set]) => set && set.size > 0);
      if (filterEntries.length > 0) {
        indices = indices.filter(idx => {
          const r = base[idx];
          return filterEntries.every(([col, set]) => set.has(String(r[col] ?? '')));
        });
      }
    }

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
    if (!shouldUseViewIndices) {
      if (viewIndices !== null) setViewIndices(null);
      return;
    }

    if (viewRecalcTimerRef.current) clearTimeout(viewRecalcTimerRef.current);
    viewRecalcTimerRef.current = setTimeout(() => {
      const ric = (window as any).requestIdleCallback;
      if (ric) ric(() => recalcViewIndices(), { timeout: 1000 });
      else recalcViewIndices();
    }, 250);

    return () => {
      if (viewRecalcTimerRef.current) clearTimeout(viewRecalcTimerRef.current);
    };
  }, [recalcViewIndices, rowCount, shouldUseViewIndices]);

  const viewCount = viewIndices ? viewIndices.length : rowCount;

  const rowVirtualizer = useVirtualizer({
    count: viewCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 20, // Increased overscan for smoother batch loading
  });

  // Batch Streaming Resume Logic
  useEffect(() => {
    if (!isPaused || isComplete || !papaParserRef.current) return;

    const virtualItems = rowVirtualizer.getVirtualItems();
    if (virtualItems.length === 0) return;

    const lastVisibleItem = virtualItems[virtualItems.length - 1];
    // If we are within 20 rows of the end of CURRENTLY LOADED rows, resume streaming
    if (lastVisibleItem.index >= rowsRef.current.length - 20) {
      setIsPaused(false);
      papaParserRef.current.resume();
    }
  }, [rowVirtualizer.getVirtualItems(), isPaused, isComplete]);

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: headers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => columnWidths[headers[index]] || 200,
    overscan: 5,
  });

  // Force virtualizer to recalculate when widths change
  useEffect(() => {
    columnVirtualizer.measure();
  }, [columnWidths, columnVirtualizer]);

  const ensureUniqueValues = useCallback((header: string) => {
    if (uniqueValuesRef.current[header] && uniqueValuesRef.current[header].size > 0) return;

    setCalculatingFilters(header);
    // Use setTimeout so the UI can show the loader first
    setTimeout(() => {
      const uniq = new Set<string>();
      const rows = rowsRef.current;
      for (let i = 0; i < rows.length; i++) {
        const v = rows[i][header];
        if (v !== undefined && v !== null && v !== '') {
          uniq.add(String(v));
        }
      }
      uniqueValuesRef.current[header] = uniq;
      setCalculatingFilters(null);
    }, 0);
  }, []);

  const getFilteredUniqueValues = useCallback((header: string) => {
    const all = uniqueValuesRef.current[header];
    if (!all) return [];
    const search = filterSearch[header]?.toLowerCase() || '';
    const sorted = Array.from(all).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    if (!search) return sorted.slice(0, 500);
    return sorted.filter(v => v.toLowerCase().includes(search)).slice(0, 500);
  }, [filterSearch]);

  const handleDownload = () => {
    const apiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8080/api/v1';
    window.open(`${apiUrl}/storage/download?key=${encodeURIComponent(fileKey)}`, '_blank');
  };

  const virtualColumns = columnVirtualizer.getVirtualItems();

  const FilterList = React.memo(({ header, hasActiveFilter }: {
    header: string;
    hasActiveFilter: boolean;
  }) => {
    const filterParentRef = useRef<HTMLDivElement>(null);
    const uniqueValues = useMemo(() => getFilteredUniqueValues(header), [header, filterSearch[header]]);
    const currentStaged = stagedFilters[header] || columnFilters[header] || new Set();

    const filterVirtualizer = useVirtualizer({
      count: uniqueValues.length,
      getScrollElement: () => filterParentRef.current,
      estimateSize: () => 32,
      overscan: 10,
    });

    return (
      <div className="flex flex-col h-full bg-white dark:bg-gray-800">
        <div ref={filterParentRef} className="flex-1 overflow-y-auto min-h-[250px] relative">
          <div
            style={{
              height: `${filterVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {filterVirtualizer.getVirtualItems().map((virtualItem) => {
              const value = uniqueValues[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  className="absolute top-0 left-0 w-full"
                  style={{
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <DropdownMenuCheckboxItem
                    checked={currentStaged.has(value)}
                    onCheckedChange={() => handleToggleStagedFilter(header, value)}
                    className="h-8"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="truncate text-xs">{value || '(empty)'}</span>
                  </DropdownMenuCheckboxItem>
                </div>
              );
            })}
          </div>
        </div>

        {uniqueValuesRef.current[header]?.size > 500 && !filterSearch[header] && (
          <div className="bg-gray-50 dark:bg-gray-900 px-3 py-1.5 text-[10px] text-gray-400 border-t italic">
            Showing first 500 of {uniqueValuesRef.current[header].size} unique values
          </div>
        )}

        <div className="p-2 border-t bg-gray-50 dark:bg-gray-900 flex items-center justify-between gap-2 sticky bottom-0 z-10">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleClearFilter(header)}
            className="h-7 text-[10px] px-2 shadow-none"
          >
            Clear
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => handleApplyFilter(header)}
            className="h-7 text-[10px] px-3 bg-blue-600 hover:bg-blue-700 text-white border-none"
          >
            Apply
          </Button>
        </div>
      </div>
    );
  });

  FilterList.displayName = "FilterList";

  return (
    <div
      data-csv-viewer={fileKey}
      className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{fileName}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {isLoadingChunk ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                {isPaused ? `Paused at ${rowCount.toLocaleString()} rows` : `Streaming... ${rowCount.toLocaleString()} rows`}
              </span>
            ) : isComplete ? (
              <span className="flex items-center gap-2">
                <span>{rowCount.toLocaleString()} rows total</span>
                {viewCount !== rowCount && <span className="text-blue-600 dark:text-blue-400">({viewCount.toLocaleString()} shown)</span>}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading... {progress.loaded.toLocaleString()} rows
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          {!isComplete && isPaused && (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setShowFullFile(true);
                setIsPaused(false);
                papaParserRef.current?.resume();
              }}
              className="bg-blue-500 hover:bg-blue-600 text-white border-none shadow-sm h-8"
            >
              Stream All
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2 h-8">
            <Download className="w-4 h-4" /> Download
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-red-500">
            <AlertCircle className="w-12 h-12 mb-4" />
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={loadCSVStream} className="mt-4">Retry</Button>
          </div>
        ) : loading && rowCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-gray-500">Loading CSV...</p>
          </div>
        ) : (
          <div ref={parentRef} className="h-full overflow-auto outline-none">
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize() + 50}px`,
                width: `${columnVirtualizer.getTotalSize() + 48}px`, // Match # column width
                position: 'relative',
              }}
            >
              <div
                className="sticky top-0 z-20 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex"
                style={{ height: '50px', width: '100%' }}
              >
                <div className="w-12 shrink-0 sticky left-0 z-30 bg-gray-100 dark:bg-gray-800 flex items-center justify-center border-r border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-500">
                  #
                </div>

                {virtualColumns.map((virtualCol) => {
                  const header = headers[virtualCol.index];
                  const activeFilter = columnFilters[header];
                  const hasActiveFilter = activeFilter && activeFilter.size > 0;

                  return (
                    <div
                      key={virtualCol.key}
                      className="absolute top-0 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 h-full"
                      style={{
                        width: `${virtualCol.size}px`,
                        left: '48px',
                        transform: `translateX(${virtualCol.start}px)`,
                      }}
                    >
                      <div className="flex items-center justify-between px-2 h-full gap-1 overflow-hidden relative group/header">
                        <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300 truncate tracking-tight py-1" title={header}>
                          {header}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleSort(header)}>
                            {sortColumn === header ? (
                              sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                            ) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                          </Button>

                          <DropdownMenu onOpenChange={(open) => open && ensureUniqueValues(header)}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className={clsx("h-5 w-5", hasActiveFilter && "text-blue-600")}>
                                <Filter className="w-3 h-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-64 max-h-[400px] flex flex-col">
                              <div className="p-2 border-b">
                                <div className="relative">
                                  <Search className="absolute left-2 top-2 w-3 h-3 text-gray-400" />
                                  <Input
                                    className="h-7 pl-7 text-[10px]"
                                    placeholder="Search values..."
                                    value={filterSearch[header] || ''}
                                    onChange={(e) => setFilterSearch(prev => ({ ...prev, [header]: e.target.value }))}
                                  />
                                </div>
                              </div>
                              <div className="flex-1 min-h-[300px] flex flex-col">
                                {calculatingFilters === header ? (
                                  <div className="flex-1 flex flex-col items-center justify-center p-8 gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                    <span className="text-[10px] text-gray-500 italic">Scanning column...</span>
                                  </div>
                                ) : (
                                  <FilterList
                                    header={header}
                                    hasActiveFilter={hasActiveFilter}
                                  />
                                )}
                              </div>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Excel-like resize handle */}
                        <div
                          className={clsx(
                            "absolute right-0 top-0 w-1.5 h-full cursor-col-resize z-30 transition-colors",
                            resizingColumn === header ? "bg-blue-500" : "hover:bg-blue-300 group-hover/header:bg-gray-300"
                          )}
                          onMouseDown={(e) => startResize(e, header)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className="relative"
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const realIndex = viewIndices ? viewIndices[virtualRow.index] : virtualRow.index;
                  const row = rowsRef.current[realIndex];

                  return (
                    <MemoizedRow
                      key={virtualRow.key}
                      virtualRow={virtualRow}
                      row={row}
                      headers={headers}
                      columnWidths={columnWidths}
                      columnItems={virtualColumns}
                      rowNumber={realIndex + 1}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
