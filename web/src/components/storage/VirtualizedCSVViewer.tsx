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
          ? 'var(--card)'
          : 'var(--muted)',
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

// Move FilterList outside to prevent re-definition on every render
const FilterList = React.memo(({
  header,
  initialFilters,
  uniqueValuesRef,
  onApply,
  onClear,
}: {
  header: string;
  initialFilters: Set<string>;
  uniqueValuesRef: React.MutableRefObject<Record<string, { set: Set<string>; sorted: string[]; lastRowCount: number }>>;
  onApply: (filters: Set<string>) => void;
  onClear: () => void;
}) => {
  const filterParentRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [localStaged, setLocalStaged] = useState<Set<string>>(new Set(initialFilters));

  // Efficiently filter the pre-sorted array
  const uniqueValues = useMemo(() => {
    const cache = uniqueValuesRef.current[header];
    if (!cache) return [];

    const searchLower = search.toLowerCase();
    if (!searchLower) return cache.sorted.slice(0, 1000);

    return cache.sorted.filter(v =>
      v.toLowerCase().includes(searchLower)
    ).slice(0, 1000);
  }, [header, search, uniqueValuesRef]);

  const toggleLocalStaged = useCallback((value: string) => {
    setLocalStaged(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const filterVirtualizer = useVirtualizer({
    count: uniqueValues.length,
    getScrollElement: () => filterParentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  return (
    <div className="flex flex-col h-full bg-card min-h-[350px]">
      <div className="p-2 border-b bg-card sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3 h-3 text-gray-400" />
          <Input
            className="h-8 pl-8 text-[11px] bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary"
            placeholder="Search values..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div
        ref={filterParentRef}
        className="flex-1 overflow-y-auto relative mt-1"
        style={{ height: '300px' }} // Fix scrolling by providing a height
      >
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
                  checked={localStaged.has(value)}
                  onCheckedChange={() => toggleLocalStaged(value)}
                  className="h-8 mx-1 rounded-sm text-xs cursor-pointer hover:bg-accent focus:bg-accent data-[state=checked]:text-primary transition-all"
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="truncate">{value || '(empty)'}</span>
                </DropdownMenuCheckboxItem>
              </div>
            );
          })}
        </div>
      </div>

      {uniqueValuesRef.current[header]?.set.size > 1000 && !search && (
        <div className="bg-muted px-3 py-1.5 text-[10px] text-muted-foreground border-t italic">
          Showing first 1,000 of {uniqueValuesRef.current[header].set.size.toLocaleString()} unique values
        </div>
      )}

      <div className="p-2 border-t bg-muted flex items-center justify-between gap-2 shadow-[0_-1px_2px_rgba(0,0,0,0.05)] sticky bottom-0 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch('');
            setLocalStaged(new Set());
            // Use requestAnimationFrame to avoid render-cycle conflicts (flushSync error)
            requestAnimationFrame(() => onClear());
          }}
          className="h-7 text-[10px] px-2 shadow-sm border border-border bg-card"
        >
          Clear
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            // Use requestAnimationFrame to avoid render-cycle conflicts (flushSync error)
            requestAnimationFrame(() => onApply(localStaged));
          }}
          className="h-7 text-[10px] px-3 font-semibold shadow-sm"
        >
          Apply
        </Button>
      </div>
    </div>
  );
});

FilterList.displayName = "FilterList";

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
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const BATCH_SIZE = 200;
  const lastBatchCountRef = useRef(0);
  const [isPaused, setIsPaused] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);
  const papaParserRef = useRef<Papa.Parser | null>(null);
  const rowsRef = useRef<CSVRow[]>([]);
  const uniqueValuesRef = useRef<Record<string, { set: Set<string>; sorted: string[]; lastRowCount: number }>>({});
  const loadedCountRef = useRef(0);
  const rafScheduledRef = useRef(false);
  const lastUpdateRowCountRef = useRef(0);
  const headersRef = useRef<string[]>([]);
  const viewRecalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [calculatingFilters, setCalculatingFilters] = useState<string | null>(null);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);

  const resizingRef = useRef<{
    column: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const headerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (headerRef.current) {
      headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

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
            // Use a loop to avoid stack overflow from spread operator on large arrays
            for (let i = 0; i < incoming.length; i++) {
              rowsRef.current.push(incoming[i]);
            }

            const currentTotal = rowsRef.current.length;
            loadedCountRef.current = currentTotal;

            // Batch streaming: pause every BATCH_SIZE rows
            if (!showFullFile && currentTotal - lastBatchCountRef.current >= BATCH_SIZE) {
              try {
                if (parser && typeof parser.pause === 'function') {
                  parser.pause();
                  setIsPaused(true);
                  lastBatchCountRef.current = currentTotal;
                }
              } catch (e) {
                console.warn("PapaParse pause() not supported or failed:", e);
                // If we can't pause, we just continue streaming - it's safer than crashing
              }
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

  const handleApplyFilter = useCallback((header: string, filters: Set<string>) => {
    setColumnFilters(prev => ({
      ...prev,
      [header]: filters
    }));
    setOpenDropdown(null);
  }, []);

  const handleClearFilter = useCallback((header: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [header]: new Set()
    }));
    setOpenDropdown(null);
  }, []);


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
      if (papaParserRef.current && typeof papaParserRef.current.resume === 'function') {
        try {
          setIsPaused(false);
          papaParserRef.current.resume();
        } catch (e) {
          console.warn("PapaParse resume() failed:", e);
        }
      } else {
        // Fallback: if we can't resume but we are paused, just mark as not paused 
        // and hope the stream progresses or handles itself
        setIsPaused(false);
      }
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
    const cache = uniqueValuesRef.current[header];
    // Refresh if we haven't scanned or if more rows have been loaded since last scan
    if (cache && cache.set.size > 0 && cache.lastRowCount === rowsRef.current.length) return;

    setCalculatingFilters(header);
    setTimeout(() => {
      const uniq = new Set<string>();
      const rows = rowsRef.current;
      for (let i = 0; i < rows.length; i++) {
        const v = rows[i][header];
        if (v !== undefined && v !== null && v !== '') {
          uniq.add(String(v));
        }
      }
      const sorted = Array.from(uniq).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );
      uniqueValuesRef.current[header] = { set: uniq, sorted, lastRowCount: rows.length };
      setCalculatingFilters(null);
    }, 0);
  }, []);

  const handleDownload = () => {
    const isIndonesia = typeof navigator !== 'undefined' && navigator.language.startsWith('id');

    // If Indonesia locale and we have the full dataset, generate CSV with semicolon
    if (isIndonesia && isComplete && rowsRef.current.length > 0) {
      try {
        const csv = Papa.unparse({
          fields: headers,
          data: rowsRef.current
        }, { delimiter: ";" });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      } catch (err) {
        console.error("Failed to generate semicolon CSV:", err);
        // Fallback to default download
      }
    }

    const apiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8080/api/v1';
    window.open(`${apiUrl}/storage/download?key=${encodeURIComponent(fileKey)}`, '_blank');
  };

  const virtualColumns = columnVirtualizer.getVirtualItems();

  return (
    <div
      data-csv-viewer={fileKey}
      className="flex flex-col h-full min-h-0 bg-card rounded-lg border border-border overflow-hidden"
    >
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50 shrink-0">
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

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
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
          <>
            {/* 1. TABLE HEADER (Synced Scroll) */}
            <div
              ref={headerRef}
              className="flex-none overflow-hidden border-b border-border bg-muted z-20"
              style={{ height: '50px' }}
            >
              <div
                className="flex items-center h-full relative"
                style={{
                  width: `${columnVirtualizer.getTotalSize() + 48}px`,
                }}
              >
                <div className="w-12 shrink-0 sticky left-0 z-30 bg-muted flex items-center justify-center border-r border-border text-xs font-bold text-muted-foreground h-full shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                  #
                </div>

                {virtualColumns.map((virtualCol) => {
                  const header = headers[virtualCol.index];
                  const activeFilter = columnFilters[header];
                  const hasActiveFilter = activeFilter && activeFilter.size > 0;

                  return (
                    <div
                      key={virtualCol.key}
                      className="absolute top-0 flex flex-col border-r border-border bg-muted h-full"
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

                          <DropdownMenu
                            open={openDropdown === header}
                            onOpenChange={(open) => {
                              if (open) {
                                ensureUniqueValues(header);
                                setOpenDropdown(header);
                              } else {
                                setOpenDropdown(null);
                              }
                            }}
                          >
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className={clsx("h-5 w-5", hasActiveFilter && "text-blue-600")}>
                                <Filter className="w-3 h-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-64 max-h-[450px] p-0 flex flex-col overflow-hidden shadow-xl border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200">
                              <div className="flex-1 flex flex-col min-h-[300px]">
                                {calculatingFilters === header ? (
                                  <div className="flex-1 flex flex-col items-center justify-center p-8 gap-2 bg-card">
                                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                    <span className="text-xs text-muted-foreground font-medium italic">Scanning column...</span>
                                  </div>
                                ) : (
                                  <FilterList
                                    header={header}
                                    initialFilters={columnFilters[header] || new Set()}
                                    uniqueValuesRef={uniqueValuesRef}
                                    onApply={(filters) => handleApplyFilter(header, filters)}
                                    onClear={() => handleClearFilter(header)}
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
            </div>

            {/* 2. TABLE BODY (Main Scroll) */}
            <div
              ref={parentRef}
              className="flex-1 overflow-auto outline-none"
              onScroll={handleScroll}
            >
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: `${columnVirtualizer.getTotalSize() + 48}px`,
                  position: 'relative',
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
          </>
        )}
      </div>
    </div>
  );
}
