import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight, Package, ShoppingCart, DollarSign, Layers, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { getPOSnapshotItems, POSnapshotItem } from '@/services/api';
import { getStatusColor } from '@/constants/poStatusColors';
import { usePODashboardFilter } from '@/contexts/PODashboardFilterContext';

interface POSnapshotDialogProps {
    status: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    summaryDefaults?: {
        totalPOs: number;
        totalQty: number;
        totalValue: number;
        totalSkus: number;
    };
}

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

export function POSnapshotDialog({ status, open, onOpenChange, summaryDefaults }: POSnapshotDialogProps) {
    const [items, setItems] = useState<POSnapshotItem[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [sortField, setSortField] = useState('total_amount');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [total, setTotal] = useState(0);
    const [grandTotals, setGrandTotals] = useState({
        totalPOS: 0,
        totalQty: 0,
        totalValue: 0,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const { poTypeFilter, releasedDateFilter } = usePODashboardFilter();

    const statusColor = status ? getStatusColor(status) : '#6B7280';

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
    const currentValueTotal = useMemo(() => items.reduce((sum, item) => sum + (item.total_amount ?? 0), 0), [items]);
    const currentPOCount = useMemo(() => new Set(items.map((item) => item.po_number)).size, [items]);
    const currentQtyTotal = useMemo(() => items.reduce((sum, item) => sum + (item.po_qty ?? 0), 0), [items]);

    const loadItems = useCallback(
        async (pageValue: number, pageSizeValue: number, sortFieldValue: string, sortDirectionValue: 'asc' | 'desc') => {
            if (!status) return;
            setLoading(true);
            setError(null);
            try {
                const response = await getPOSnapshotItems({
                    status,
                    page: pageValue,
                    pageSize: pageSizeValue,
                    sortField: sortFieldValue,
                    sortDirection: sortDirectionValue,
                    poType: poTypeFilter !== 'ALL' ? poTypeFilter : undefined,
                    releasedDate: releasedDateFilter || undefined,
                });
                setItems(response.items ?? []);
                setTotal(response.total ?? 0);
                setGrandTotals({
                    totalPOS: response.total_pos ?? 0,
                    totalQty: response.total_qty ?? 0,
                    totalValue: response.total_value ?? 0,
                });
                setPage(pageValue);
                setPageSize(pageSizeValue);
            } catch (err) {
                console.error('Failed to load PO snapshot items', err);
                setError('Failed to load purchase orders');
                setItems([]);
                setTotal(0);
            } finally {
                setLoading(false);
            }
        },
        [status, poTypeFilter, releasedDateFilter]
    );

    useEffect(() => {
        if (open && status) {
            loadItems(1, pageSize, sortField, sortDirection);
        } else if (!open) {
            setItems([]);
            setTotal(0);
            setError(null);
            setPage(1);
            // Reset sort if desired, or keep user preference
            setSortField('total_amount');
            setSortDirection('desc');
        }
    }, [open, status, pageSize, poTypeFilter, releasedDateFilter, sortField, sortDirection, loadItems]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc'); // Default to desc for new fields usually better for numbers
        }
    };

    const handlePageChange = (nextPage: number) => {
        const clamped = Math.max(1, Math.min(totalPages, nextPage));
        // State updates will trigger useEffect to reload
        setPage(clamped);
    };

    const handlePageSizeChange = (size: number) => {
        setPageSize(size);
        setPage(1);
    };

    const fetchAllItemsForDownload = useCallback(async () => {
        if (!status) return [];

        const aggregated: POSnapshotItem[] = [];
        const dlPageSize = 500;
        let dlPage = 1;
        let dlTotal = Infinity;

        while (aggregated.length < dlTotal) {
            const response = await getPOSnapshotItems({
                status,
                page: dlPage,
                pageSize: dlPageSize,
                sortField,
                sortDirection,
                poType: poTypeFilter !== 'ALL' ? poTypeFilter : undefined,
                releasedDate: releasedDateFilter || undefined,
            });

            if (!response.items || response.items.length === 0) {
                break;
            }

            aggregated.push(...response.items);
            dlTotal = response.total ?? aggregated.length;

            if (response.items.length < dlPageSize) {
                break;
            }
            dlPage += 1;
        }
        return aggregated;
    }, [status, poTypeFilter, releasedDateFilter, sortField, sortDirection]);

    const handleDownload = useCallback(async () => {
        if (!status || isDownloading) return;

        setIsDownloading(true);
        try {
            const allItems = await fetchAllItemsForDownload();
            if (allItems.length === 0) {
                setError('No items available to download');
                return;
            }

            const headers = [
                'PO Number',
                'SKU',
                'Product Name',
                'Brand',
                'Store',
                'Qty',
                'Total Amount',
                'Released',
                'Sent',
                'Approved',
                'Arrived',
                'Received',
            ];

            const escapeCsvValue = (value: string | number | null) => {
                const stringValue = value === null ? '' : `${value}`;
                if (/[",\n]/.test(stringValue)) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            };

            const rows = allItems.map(item => [
                item.po_number,
                item.sku,
                item.product_name,
                item.brand_name,
                item.store_name,
                item.po_qty,
                item.total_amount,
                formatDate(item.po_released_at),
                formatDate(item.po_sent_at),
                formatDate(item.po_approved_at),
                formatDate(item.po_arrived_at),
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(escapeCsvValue).join(','))
                .join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const datePart = new Date().toISOString().split('T')[0];
            link.download = `po-snapshot-${status}-${datePart}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to download CSV', err);
            setError('Failed to download CSV');
        } finally {
            setIsDownloading(false);
        }
    }, [status, isDownloading, fetchAllItemsForDownload]);

    // Helper to render sort arrow
    const renderSortIcon = (field: string) => {
        if (sortField !== field) return null;
        return sortDirection === 'asc' ? <ArrowUp size={14} className="ml-1" /> : <ArrowDown size={14} className="ml-1" />;
    };

    // Helper for table head cell
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

    // Calculate display values
    const displaySkus = summaryDefaults?.totalSkus ?? total;
    const displayPOs = summaryDefaults?.totalPOs ?? grandTotals.totalPOS;
    const displayQty = summaryDefaults?.totalQty ?? grandTotals.totalQty;
    const displayValue = summaryDefaults?.totalValue ?? grandTotals.totalValue;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[96vw] max-w-6xl h-[90vh] p-0 flex flex-col gap-0 border-none bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden focus-visible:outline-none">
                {/* Header Section */}
                <div className="flex-none p-6 pb-2 border-b border-border/40">
                    <div className="flex justify-between items-start">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-3 text-2xl font-bold tracking-tight">
                                <div
                                    className="flex h-4 w-4 rounded-full shadow-md ring-2 ring-offset-2 ring-offset-background"
                                    style={{ backgroundColor: statusColor, boxShadow: `0 0 10px ${statusColor}60` }}
                                />
                                {status ? `PO ${status}` : 'Purchase Orders'}
                                <span className="text-sm font-normal text-muted-foreground ml-2 px-2 py-0.5 rounded-full bg-muted">
                                    {displayPOs.toLocaleString('id-ID')} Orders
                                </span>
                            </DialogTitle>
                            <DialogDescription className="text-base mt-1.5 ml-7 text-muted-foreground/80">
                                Detailed breakdown of purchase orders currently in <span className="font-medium text-foreground">{status}</span> status.
                            </DialogDescription>
                        </DialogHeader>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="gap-1 mt-1"
                            onClick={handleDownload}
                            disabled={loading || isDownloading || items.length === 0}
                        >
                            <Download className="h-4 w-4" />
                            {isDownloading ? 'Downloading...' : 'Download CSV'}
                        </Button>
                    </div>

                    {/* Global Stats Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                        <div className="group relative overflow-hidden rounded-xl border border-border/40 bg-card/40 p-4 transition-all hover:bg-card/60">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Total Value</span>
                                <DollarSign size={16} className="text-primary/70" />
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-2xl font-bold tracking-tight">{formatCurrency(displayValue)}</span>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>

                        <div className="group relative overflow-hidden rounded-xl border border-border/40 bg-card/40 p-4 transition-all hover:bg-card/60">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Total Qty</span>
                                <Package size={16} className="text-blue-500/70" />
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-2xl font-bold tracking-tight">{displayQty.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>

                        <div className="group relative overflow-hidden rounded-xl border border-border/40 bg-card/40 p-4 transition-all hover:bg-card/60">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Total SKUs</span>
                                <Layers size={16} className="text-purple-500/70" />
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-2xl font-bold tracking-tight">{displaySkus.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-purple-500/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>

                        <div className="group relative overflow-hidden rounded-xl border border-border/40 bg-card/40 p-4 transition-all hover:bg-card/60">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Total POs</span>
                                <ShoppingCart size={16} className="text-amber-500/70" />
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-2xl font-bold tracking-tight">{displayPOs.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                    </div>
                </div>

                {/* Table Section */}
                <div className="flex-1 overflow-hidden relative bg-muted/5">
                    <div className="absolute inset-0 overflow-auto">
                        <Table>
                            <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur shadow-sm">
                                <TableRow className="hover:bg-transparent border-b border-border/60">
                                    <SortableHead field="po_number" label="PO Number" className="w-[140px] font-semibold text-foreground/80" />
                                    <SortableHead field="sku" label="SKU" className="w-[120px] font-semibold text-foreground/80" />
                                    <SortableHead field="product_name" label="Product" className="min-w-[200px] font-semibold text-foreground/80" />
                                    <SortableHead field="store_name" label="Store" className="min-w-[150px] font-semibold text-foreground/80" />
                                    <SortableHead field="po_qty" label="Qty" align="right" className="text-right font-semibold text-foreground/80" />
                                    <SortableHead field="total_amount" label="Total" align="right" className="text-right font-semibold text-foreground/80" />
                                    <SortableHead field="po_released_at" label="Released" align="right" className="text-right font-semibold text-foreground/80" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {!status && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                                            Select a status card to view details.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {status && loading && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-64 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                                <p>Loading purchase orders...</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                                {status && !loading && error && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-48 text-center text-destructive">
                                            {error}
                                        </TableCell>
                                    </TableRow>
                                )}
                                {status && !loading && !error && items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                                            No purchase orders found for this status.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {status && !loading && !error &&
                                    items.map((item, index) => (
                                        <TableRow
                                            key={`${item.po_number}-${item.sku}`}
                                            className={`
                                                group transition-colors border-b border-border/40
                                                ${index % 2 === 0 ? 'bg-transparent' : 'bg-muted/30'}
                                                hover:bg-muted/60
                                            `}
                                        >
                                            <TableCell className="font-mono text-xs font-medium text-foreground/90">{item.po_number}</TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground group-hover:text-foreground/90">{item.sku}</TableCell>
                                            <TableCell>
                                                <div className="max-w-[250px] truncate font-medium text-sm text-foreground/90" title={item.product_name}>
                                                    {item.product_name}
                                                </div>
                                                <div className="text-xs text-muted-foreground/60 truncate">{item.brand_name}</div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{item.store_name || '—'}</TableCell>
                                            <TableCell className="text-right font-mono text-sm">{item.po_qty.toLocaleString('id-ID')}</TableCell>
                                            <TableCell className="text-right font-mono text-sm font-medium text-foreground/90">{formatCurrency(item.total_amount)}</TableCell>
                                            <TableCell className="text-right text-xs text-muted-foreground">{formatDate(item.po_released_at)}</TableCell>
                                        </TableRow>
                                    ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {/* Footer Section */}
                <div className="flex-none p-4 border-t border-border/40 bg-muted/10 backdrop-blur-sm">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
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
                            <span className="text-xs text-muted-foreground">
                                Page <span className="font-medium text-foreground">{page}</span> of {totalPages}
                            </span>
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
            </DialogContent>
        </Dialog>
    );
}
