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
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
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
    const [total, setTotal] = useState(0);
    // Use summaryDefaults if available for initial state, but can still be updated by API if needed,
    // though the requirement is to use the passed summary for "Global Totals".
    // We will separate the "display" totals from the "API response" totals.
    const [grandTotals, setGrandTotals] = useState({
        totalPOS: 0,
        totalQty: 0,
        totalValue: 0,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { poTypeFilter, releasedDateFilter } = usePODashboardFilter();

    const statusColor = status ? getStatusColor(status) : '#6B7280';

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
    const currentValueTotal = useMemo(() => items.reduce((sum, item) => sum + (item.total_amount ?? 0), 0), [items]);
    const currentPOCount = useMemo(() => new Set(items.map((item) => item.po_number)).size, [items]);
    const currentQtyTotal = useMemo(() => items.reduce((sum, item) => sum + (item.po_qty ?? 0), 0), [items]);

    const loadItems = useCallback(
        async (pageValue: number, pageSizeValue: number) => {
            if (!status) return;
            setLoading(true);
            setError(null);
            try {
                const response = await getPOSnapshotItems({
                    status,
                    page: pageValue,
                    pageSize: pageSizeValue,
                    sortField: 'total_amount',
                    sortDirection: 'desc',
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
            loadItems(1, pageSize);
        } else if (!open) {
            setItems([]);
            setTotal(0);
            setError(null);
            setPage(1);
        }
    }, [open, status, pageSize, poTypeFilter, releasedDateFilter, loadItems]);

    const handlePageChange = (nextPage: number) => {
        const clamped = Math.max(1, Math.min(totalPages, nextPage));
        loadItems(clamped, pageSize);
    };

    const handlePageSizeChange = (size: number) => {
        loadItems(1, size);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[96vw] max-w-6xl border-border/60 bg-background/95 backdrop-blur-xl max-h-[90vh] overflow-y-auto p-0 sm:p-6 flex flex-col">
                <div className="flex h-full min-h-0 flex-col gap-4">
                    <DialogHeader className="py-4 sm:py-0 sm:pb-4">
                        <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
                            <span
                                className="flex h-3 w-3 rounded-full"
                                style={{ backgroundColor: statusColor }}
                            />
                            {status ? `PO ${status}` : 'Purchase Orders'}
                        </DialogTitle>
                        <DialogDescription>
                            {status
                                ? 'Latest captured purchase orders for this lifecycle status.'
                                : 'Pick a status to inspect its purchase orders.'}
                        </DialogDescription>
                    </DialogHeader>


                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Global totals (respecting current filters)</p>
                            <span className="text-[11px] text-muted-foreground">Last snapshot set</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Items (SKU)</p>
                                {/* Use summaryDefaults.totalSkus if available, otherwise fall back to 'total' which is items count from API */}
                                <p className="mt-2 text-2xl font-semibold">
                                    {(summaryDefaults?.totalSkus ?? total).toLocaleString('id-ID')}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total PO Count</p>
                                <p className="mt-2 text-2xl font-semibold">
                                    {(summaryDefaults?.totalPOs ?? grandTotals.totalPOS).toLocaleString('id-ID')}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Ordered Qty</p>
                                <p className="mt-2 text-2xl font-semibold">
                                    {(summaryDefaults?.totalQty ?? grandTotals.totalQty).toLocaleString('id-ID')}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Value</p>
                                <p className="mt-2 text-2xl font-semibold">
                                    {formatCurrency(summaryDefaults?.totalValue ?? grandTotals.totalValue)}
                                </p>
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-3">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Page Items</p>
                                <p className="mt-1 text-lg font-semibold">{items.length.toLocaleString('id-ID')}</p>
                            </div>
                            <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-3">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Page PO Count</p>
                                <p className="mt-1 text-lg font-semibold">{currentPOCount.toLocaleString('id-ID')}</p>
                            </div>
                            <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-3">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Page Ordered Qty</p>
                                <p className="mt-1 text-lg font-semibold">{currentQtyTotal.toLocaleString('id-ID')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 rounded-2xl border border-border/60 overflow-y-auto">
                        <div className="h-full min-h-0 w-full overflow-auto">
                            <Table className="min-w-[900px]">
                                <TableHeader>
                                    <TableRow className="bg-muted/40">
                                        <TableHead>PO Number</TableHead>
                                        <TableHead>SKU</TableHead>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Store</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="text-right">Released</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!status && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                                                Select a status card to view details.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {status && loading && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                                                <div className="flex flex-col items-center gap-3">
                                                    <Loader2 className="h-6 w-6 animate-spin" />
                                                    Loading purchase orders…
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {status && !loading && error && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="py-12 text-center text-red-500">
                                                {error}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {status && !loading && !error && items.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                                                No purchase orders found for this status.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {status && !loading && !error &&
                                        items.map((item) => (
                                            <TableRow key={`${item.po_number}-${item.sku}`} className="hover:bg-muted/30">
                                                <TableCell className="font-mono text-xs">{item.po_number}</TableCell>
                                                <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                                                <TableCell className="max-w-[220px] truncate" title={item.product_name}>
                                                    {item.product_name}
                                                </TableCell>
                                                <TableCell>{item.store_name || '—'}</TableCell>
                                                <TableCell className="text-right">{item.po_qty.toLocaleString('id-ID')}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(item.total_amount)}</TableCell>
                                                <TableCell className="text-right">{formatDate(item.po_released_at)}</TableCell>
                                            </TableRow>
                                        ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Rows per page:</span>
                            <div className="flex gap-1">
                                {PAGE_SIZE_OPTIONS.map((size) => (
                                    <Button
                                        key={size}
                                        variant={size === pageSize ? 'default' : 'outline'}
                                        size="sm"
                                        className="px-3"
                                        onClick={() => handlePageSizeChange(size)}
                                        disabled={loading}
                                    >
                                        {size}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 self-end text-xs text-muted-foreground sm:self-auto">
                            <span>
                                Page {page} / {totalPages}
                            </span>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 px-2"
                                    onClick={() => handlePageChange(page - 1)}
                                    disabled={loading || page === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Prev
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 px-2"
                                    onClick={() => handlePageChange(page + 1)}
                                    disabled={loading || page === totalPages}
                                >
                                    Next
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
