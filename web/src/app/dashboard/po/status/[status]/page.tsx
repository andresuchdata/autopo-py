'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight, Package, ShoppingCart, DollarSign, Layers, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { getPOSnapshotItems, POSnapshotItem } from '@/services/api';
import { getStatusColor } from '@/constants/poStatusColors';
import { usePODashboardFilter } from '@/contexts/PODashboardFilterContext';
import * as XLSX from 'xlsx';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value);

const formatNumberShort = (value: number) => {
    if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toLocaleString('id-ID');
};

const formatDate = (value: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

const excelSafeText = (value: string | number | null) => {
    const stringValue = value === null ? '' : `${value}`;
    if (stringValue === '') return '';
    return `="${stringValue.replace(/"/g, '""')}"`;
};

export default function POStatusPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

    const status = decodeURIComponent(params.status as string);
    const displayStatus = status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : '';
    const { poTypeFilter, releasedDateFilter, storeIdsFilter, brandIdsFilter, supplierIdsFilter } = usePODashboardFilter();

    const [items, setItems] = useState<POSnapshotItem[]>([]);

    // Get params from URL
    const page = Number(searchParams.get('page')) || 1;
    const pageSize = Number(searchParams.get('pageSize')) || 20;
    const sortField = searchParams.get('sortField') || 'total_amount';
    const sortDirection = (searchParams.get('sortDirection') as 'asc' | 'desc') || 'desc';
    const storeIdParam = searchParams.get('store_id');

    const [total, setTotal] = useState(0);
    const [grandTotals, setGrandTotals] = useState({
        totalPOS: 0,
        totalQty: 0,
        totalValue: 0,
        totalSKUs: 0,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    const statusColor = getStatusColor(status);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
    const currentValueTotal = useMemo(() => items.reduce((sum, item) => sum + (item.total_amount ?? 0), 0), [items]);
    const currentQtyTotal = useMemo(() => items.reduce((sum, item) => sum + (item.po_qty ?? 0), 0), [items]);

    // Helper to update URL params
    const updateParams = useCallback((newParams: Record<string, string | number>) => {
        const current = new URLSearchParams(searchParams.toString());

        Object.entries(newParams).forEach(([key, value]) => {
            current.set(key, String(value));
        });

        const searchString = current.toString();
        router.push(`${pathname}?${searchString}`);
    }, [searchParams, pathname, router]);

    const loadItems = useCallback(
        async () => {
            setLoading(true);
            setError(null);

            try {
                // effectiveStoreIds: URL param takes precedence over context if present
                // Support both store_id (singular) and store_ids (plural/comma-separated)
                let effectiveStoreIds = storeIdsFilter;

                const storeIdsParam = searchParams.get('store_ids');
                if (storeIdsParam) {
                    effectiveStoreIds = storeIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
                } else if (storeIdParam) {
                    effectiveStoreIds = [parseInt(storeIdParam)];
                }

                let effectiveSupplierIds = supplierIdsFilter;
                const supplierIdsParam = searchParams.get('supplier_ids');
                if (supplierIdsParam) {
                    effectiveSupplierIds = supplierIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
                }

                let effectiveBrandIds = brandIdsFilter;
                const brandIdsParam = searchParams.get('brand_ids');
                if (brandIdsParam) {
                    effectiveBrandIds = brandIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
                }

                const response = await getPOSnapshotItems({
                    status,
                    page,
                    pageSize,
                    sortField,
                    sortDirection,
                    poType: poTypeFilter !== 'ALL' ? poTypeFilter : undefined,
                    releasedDate: releasedDateFilter || undefined,
                    storeIds: effectiveStoreIds,
                    brandIds: effectiveBrandIds,
                    supplierIds: effectiveSupplierIds,
                });
                setItems(response.items ?? []);
                setTotal(response.total ?? 0);
                setGrandTotals({
                    totalPOS: response.total_pos ?? 0,
                    totalQty: response.total_qty ?? 0,
                    totalValue: response.total_value ?? 0,
                    totalSKUs: response.total_skus ?? 0,
                });
            } catch (err) {
                console.error('Failed to load PO snapshot items', err);
                setError('Failed to load purchase orders');
                setItems([]);
                setTotal(0);
            } finally {
                setLoading(false);
            }
        },
        [status, page, pageSize, sortField, sortDirection, poTypeFilter, releasedDateFilter, storeIdsFilter, brandIdsFilter, supplierIdsFilter, storeIdParam]
    );

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            updateParams({ sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' });
        } else {
            updateParams({ sortField: field, sortDirection: 'desc' });
        }
    };

    const handlePageChange = (nextPage: number) => {
        const clamped = Math.max(1, Math.min(totalPages, nextPage));
        updateParams({ page: clamped });
    };

    const handlePageSizeChange = (size: number) => {
        updateParams({ pageSize: size, page: 1 });
    };

    const fetchAllItemsForDownload = useCallback(async () => {
        const dlPageSize = 100;

        let effectiveStoreIds = storeIdsFilter;
        const storeIdsParam = searchParams.get('store_ids');
        if (storeIdsParam) {
            effectiveStoreIds = storeIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        } else if (storeIdParam) {
            effectiveStoreIds = [parseInt(storeIdParam)];
        }

        let effectiveSupplierIds = supplierIdsFilter;
        const supplierIdsParam = searchParams.get('supplier_ids');
        if (supplierIdsParam) {
            effectiveSupplierIds = supplierIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        }

        let effectiveBrandIds = brandIdsFilter;
        const brandIdsParam = searchParams.get('brand_ids');
        if (brandIdsParam) {
            effectiveBrandIds = brandIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        }

        const baseParams = {
            status,
            pageSize: dlPageSize,
            sortField,
            sortDirection,
            poType: poTypeFilter !== 'ALL' ? poTypeFilter : undefined,
            releasedDate: releasedDateFilter || undefined,
            storeIds: effectiveStoreIds,
            brandIds: effectiveBrandIds,
            supplierIds: effectiveSupplierIds,
        };

        const firstResponse = await getPOSnapshotItems({ ...baseParams, page: 1 });
        const firstItems = firstResponse.items ?? [];
        const totalItems = firstResponse.total ?? firstItems.length;
        if (totalItems <= firstItems.length) return firstItems;

        const totalPages = Math.max(1, Math.ceil(totalItems / dlPageSize));
        const pagesToFetch: number[] = [];
        for (let p = 2; p <= totalPages; p += 1) pagesToFetch.push(p);

        const concurrency = 5;
        const pageResults: Array<POSnapshotItem[] | undefined> = new Array(totalPages + 1);
        pageResults[1] = firstItems;

        const fetchPage = async (pageValue: number) => {
            const response = await getPOSnapshotItems({ ...baseParams, page: pageValue });
            pageResults[pageValue] = response.items ?? [];
        };

        let cursor = 0;
        const workers = Array.from({ length: Math.min(concurrency, pagesToFetch.length) }, async () => {
            while (cursor < pagesToFetch.length) {
                const pageValue = pagesToFetch[cursor];
                cursor += 1;
                await fetchPage(pageValue);
            }
        });

        await Promise.all(workers);

        const aggregated: POSnapshotItem[] = [];
        for (let p = 1; p <= totalPages; p += 1) {
            const pageItems = pageResults[p];
            if (pageItems && pageItems.length > 0) aggregated.push(...pageItems);
        }

        return aggregated;
    }, [status, poTypeFilter, releasedDateFilter, sortField, sortDirection, storeIdsFilter, brandIdsFilter, supplierIdsFilter]);

    const downloadAsExcel = useCallback((excelItems: POSnapshotItem[], scopeLabel: string) => {
        const headers = [
            'Snapshot Time', 'PO Number', 'SKU', 'Product Name', 'Brand', 'Store', 'Supplier',
            'Qty', 'Total Amount', 'Released', 'Sent', 'Approved', 'ETA', 'Arrived', 'Received'
        ];

        const rows = excelItems.map((item) => [
            formatDate(item.snapshot_time), item.po_number, item.sku, item.product_name,
            item.brand_name, item.store_name, item.supplier_name ?? '', item.po_qty, item.total_amount,
            formatDate(item.po_released_at), formatDate(item.po_sent_at), formatDate(item.po_approved_at),
            formatDate(item.eta), formatDate(item.po_arrived_at), formatDate(item.po_received_at)
        ]);

        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'PO Snapshot');
        const datePart = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `po-snapshot-${scopeLabel}-${status}-${datePart}.xlsx`);
    }, [status]);

    const handleDownloadAllExcel = async () => {
        if (isDownloading) return;
        setIsDownloading(true);
        try {
            const allItems = await fetchAllItemsForDownload();
            if (allItems.length === 0) {
                setError('No items available to download');
                return;
            }
            downloadAsExcel(allItems, 'all');
        } catch (err) {
            console.error('Failed to download Excel', err);
            setError('Failed to download Excel');
        } finally {
            setIsDownloading(false);
        }
    };

    const renderSortIcon = (field: string) => {
        if (sortField !== field) return null;
        return sortDirection === 'asc' ? <ArrowUp size={14} className="ml-1" /> : <ArrowDown size={14} className="ml-1" />;
    };

    const SortableHead = ({ field, label, align = 'left', className = '' }: { field: string, label: string, align?: 'left' | 'right', className?: string }) => (
        <TableHead
            className={`cursor-pointer hover:bg-muted/50 transition-colors select-none ${className}`}
            onClick={() => handleSort(field)}
        >
            <div className={`flex items-center ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                {label}
                {renderSortIcon(field)}
            </div>
        </TableHead>
    );

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            {/* Header */}
            <div className="flex-none p-4 pb-2 border-b border-border/40 bg-background/95 backdrop-blur z-10 sticky top-0">
                <div className="max-w-[1600px] mx-auto w-full">
                    <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-2 text-muted-foreground hover:text-foreground h-8 px-2 -ml-2">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                    </Button>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div>
                            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                                <div
                                    className="flex h-4 w-4 rounded-full shadow-md ring-2 ring-offset-2 ring-offset-background"
                                    style={{ backgroundColor: statusColor, boxShadow: `0 0 10px ${statusColor}60` }}
                                />
                                {displayStatus ? `PO ${displayStatus}` : 'Purchase Orders'}
                                <span className="text-xs font-normal text-muted-foreground ml-2 px-2 py-0.5 rounded-full bg-muted border border-border/50">
                                    {grandTotals.totalPOS.toLocaleString('id-ID')} Orders
                                </span>
                            </h1>
                            <p className="text-sm mt-1 text-muted-foreground/80 max-w-2xl">
                                Detailed breakdown of purchase orders currently in <span className="font-medium text-foreground">{displayStatus}</span> status.
                                Showing {items.length} items on this page.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={handleDownloadAllExcel}
                                disabled={loading || isDownloading || (total === 0)}
                            >
                                <Download className="h-4 w-4" />
                                {isDownloading ? 'Downloading...' : 'Download Report'}
                            </Button>
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                        <div className="px-4 py-3 rounded-xl border border-border/40 bg-card/40">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Total Value</span>
                                <DollarSign size={14} className="text-primary/70" />
                            </div>
                            <div className="mt-1 text-lg font-bold tracking-tight">{formatCurrency(grandTotals.totalValue)}</div>
                        </div>
                        <div className="px-4 py-3 rounded-xl border border-border/40 bg-card/40">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Total Qty</span>
                                <Package size={14} className="text-blue-500/70" />
                            </div>
                            <div className="mt-1 text-lg font-bold tracking-tight">{grandTotals.totalQty.toLocaleString('id-ID')}</div>
                        </div>
                        <div className="px-4 py-3 rounded-xl border border-border/40 bg-card/40">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Total SKUs</span>
                                <Layers size={14} className="text-purple-500/70" />
                            </div>
                            <div className="mt-1 text-lg font-bold tracking-tight">{grandTotals.totalSKUs.toLocaleString('id-ID')}</div>
                        </div>
                        <div className="px-4 py-3 rounded-xl border border-border/40 bg-card/40">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Total POs</span>
                                <ShoppingCart size={14} className="text-amber-500/70" />
                            </div>
                            <div className="mt-1 text-lg font-bold tracking-tight">{grandTotals.totalPOS.toLocaleString('id-ID')}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table Section */}
            <div className="flex-1 overflow-auto">
                <div className="max-w-[1600px] mx-auto w-full p-4">
                    <div className="rounded-md border bg-card shadow-sm">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-b border-border/60">
                                    <SortableHead field="snapshot_time" label="Snapshot Date" className="w-auto font-semibold text-foreground/80" />
                                    <SortableHead field="po_number" label="PO Number" className="w-[140px] font-semibold text-foreground/80" />
                                    <SortableHead field="sku" label="SKU" className="w-[120px] font-semibold text-foreground/80" />
                                    <SortableHead field="product_name" label="Product" className="min-w-[200px] font-semibold text-foreground/80" />
                                    <SortableHead field="store_name" label="Store" className="min-w-[150px] font-semibold text-foreground/80" />
                                    <SortableHead field="supplier_name" label="Supplier" className="min-w-[160px] font-semibold text-foreground/80" />
                                    <SortableHead field="po_qty" label="Qty" align="right" className="text-right font-semibold text-foreground/80" />
                                    <SortableHead field="total_amount" label="Total" align="right" className="text-right font-semibold text-foreground/80" />
                                    <SortableHead field="po_released_at" label="Released" align="right" className="text-right font-semibold text-foreground/80" />
                                    <SortableHead field="po_sent_at" label="Sent" align="right" className="text-right font-semibold text-foreground/80" />
                                    <SortableHead field="po_approved_at" label="Approved" align="right" className="text-right font-semibold text-foreground/80" />
                                    <SortableHead field="po_eta" label="ETA" align="right" className="text-right font-semibold text-foreground/80" />
                                    <SortableHead field="po_arrived_at" label="Arrived" align="right" className="text-right font-semibold text-foreground/80" />
                                    <SortableHead field="po_received_at" label="Received" align="right" className="text-right font-semibold text-foreground/80" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading && (
                                    <TableRow>
                                        <TableCell colSpan={14} className="h-64 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                                <p>Loading purchase orders...</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                                {!loading && error && (
                                    <TableRow>
                                        <TableCell colSpan={14} className="h-48 text-center text-destructive">
                                            {error}
                                        </TableCell>
                                    </TableRow>
                                )}
                                {!loading && !error && items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={14} className="h-48 text-center text-muted-foreground">
                                            No purchase orders found.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {!loading && !error && items.map((item, index) => (
                                    <TableRow
                                        key={`${item.po_number}-${item.sku}`}
                                        className={`
                                            group transition-colors border-b border-border/40
                                            ${index % 2 === 0 ? 'bg-transparent' : 'bg-muted/30'}
                                            hover:bg-muted/60
                                        `}
                                    >
                                        <TableCell className="text-xs text-muted-foreground">{formatDate(item.snapshot_time)}</TableCell>
                                        <TableCell className="font-mono text-xs font-medium text-foreground/90">
                                            <a
                                                href={`/dashboard/po/${encodeURIComponent(item.po_number)}`}
                                                className="hover:underline text-primary"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    router.push(`/dashboard/po/${encodeURIComponent(item.po_number)}`);
                                                }}
                                            >
                                                {item.po_number}
                                            </a>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground group-hover:text-foreground/90">{item.sku}</TableCell>
                                        <TableCell>
                                            <div className="max-w-[200px] truncate font-medium text-sm text-foreground/90" title={item.product_name}>
                                                {item.product_name}
                                            </div>
                                            <div className="text-xs text-muted-foreground/60 truncate">{item.brand_name}</div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{item.store_name || '—'}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {item.supplier_name && item.supplier_id ? (
                                                <a
                                                    href={`/dashboard/supplier/${item.supplier_id}?returnTo=${encodeURIComponent(currentUrl)}`}
                                                    className="font-medium text-foreground/90 hover:underline hover:text-primary transition-colors"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        router.push(`/dashboard/supplier/${item.supplier_id}?returnTo=${encodeURIComponent(currentUrl)}`);
                                                    }}
                                                >
                                                    {item.supplier_name}
                                                </a>
                                            ) : (
                                                item.supplier_name || '—'
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">{item.po_qty.toLocaleString('id-ID')}</TableCell>
                                        <TableCell className="text-right font-mono text-sm font-medium text-foreground/90">{formatCurrency(item.total_amount)}</TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">{formatDate(item.po_released_at)}</TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">{formatDate(item.po_sent_at)}</TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">{formatDate(item.po_approved_at)}</TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground font-medium text-blue-600">{formatDate(item.eta)}</TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">{formatDate(item.po_arrived_at)}</TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">{formatDate(item.po_received_at)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-4">
                        <div className="flex items-center gap-6 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <span>Rows per page</span>
                                <div className="flex rounded-md border border-border/50 bg-background/50 p-0.5">
                                    {PAGE_SIZE_OPTIONS.map((size) => (
                                        <button
                                            key={size}
                                            onClick={() => handlePageSizeChange(size)}
                                            disabled={loading}
                                            className={`
                                                px-2.5 py-1 rounded-sm transition-all
                                                ${size === pageSize
                                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                                                }
                                            `}
                                        >
                                            {size}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <span className="hidden sm:inline-block w-px h-4 bg-border/60" />
                            <div className="hidden sm:flex gap-4">
                                <span>Page Items: <span className="font-medium text-foreground">{items.length.toLocaleString('id-ID')}</span></span>
                                <span>Page Qty: <span className="font-medium text-foreground">{currentQtyTotal.toLocaleString('id-ID')}</span></span>
                                <span>Page Value: <span className="font-medium text-foreground">{formatNumberShort(currentValueTotal)}</span></span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Page</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={totalPages}
                                    value={page}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (!isNaN(val) && val >= 1 && val <= totalPages) {
                                            handlePageChange(val);
                                        }
                                    }}
                                    className="h-8 w-12 rounded-md border border-input bg-background px-2 py-1 text-center text-xs font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                                <span className="text-xs text-muted-foreground">of {totalPages}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handlePageChange(page - 1)}
                                    disabled={loading || page === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handlePageChange(page + 1)}
                                    disabled={loading || page === totalPages}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
