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
import { getSupplierPOItems, SupplierPOItem } from '@/services/api';

interface SupplierPODialogProps {
    supplier: { id: number; name: string } | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50];

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

export function SupplierPODialog({ supplier, open, onOpenChange }: SupplierPODialogProps) {
    const [items, setItems] = useState<SupplierPOItem[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

    const loadItems = useCallback(
        async (pageValue: number, pageSizeValue: number) => {
            if (!supplier) return;
            setLoading(true);
            setError(null);
            try {
                const response = await getSupplierPOItems({
                    supplierId: supplier.id,
                    page: pageValue,
                    pageSize: pageSizeValue,
                    sortField: 'po_released_at',
                    sortDirection: 'desc',
                });
                setItems(response.items ?? []);
                setTotal(response.total ?? 0);
                setPage(pageValue);
                setPageSize(pageSizeValue);
            } catch (err) {
                console.error('Failed to load supplier PO items', err);
                setError('Failed to load supplier purchase orders');
                setItems([]);
                setTotal(0);
            } finally {
                setLoading(false);
            }
        },
        [supplier]
    );

    useEffect(() => {
        if (open && supplier) {
            loadItems(1, pageSize);
        } else if (!open) {
            setItems([]);
            setTotal(0);
            setError(null);
            setPage(1);
        }
    }, [open, supplier, pageSize, loadItems]);

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
                        <DialogTitle className="text-xl font-semibold">
                            {supplier ? `Supplier: ${supplier.name}` : 'Supplier Purchase Orders'}
                        </DialogTitle>
                        <DialogDescription>
                            Detailed PO lines grouped by supplier. Includes SKU, brand, and PO lifecycle timestamps.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Items</p>
                            <p className="mt-2 text-2xl font-semibold">{total.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Supplier ID</p>
                            <p className="mt-2 text-2xl font-semibold">{supplier?.id ?? '—'}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Supplier</p>
                            <p className="mt-2 truncate text-2xl font-semibold" title={supplier?.name || ''}>
                                {supplier?.name ?? '—'}
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 rounded-2xl border border-border/60 overflow-y-auto">
                        <div className="h-full min-h-0 w-full overflow-auto">
                            <Table className="min-w-[1000px]">
                                <TableHeader>
                                    <TableRow className="bg-muted/40">
                                        <TableHead>SKU</TableHead>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Brand</TableHead>
                                        <TableHead>Supplier ID</TableHead>
                                        <TableHead>Supplier</TableHead>
                                        <TableHead>PO Released</TableHead>
                                        <TableHead>PO Sent</TableHead>
                                        <TableHead>PO Approved</TableHead>
                                        <TableHead>PO Arrived</TableHead>
                                        <TableHead>PO Received</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!supplier && (
                                        <TableRow>
                                            <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                                                Select a bar in Supplier Performance to view its PO lines.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {supplier && loading && (
                                        <TableRow>
                                            <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                                                <div className="flex flex-col items-center gap-3">
                                                    <Loader2 className="h-6 w-6 animate-spin" />
                                                    Loading supplier purchase orders…
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {supplier && !loading && error && (
                                        <TableRow>
                                            <TableCell colSpan={10} className="py-12 text-center text-red-500">
                                                {error}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {supplier && !loading && !error && items.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                                                No purchase orders found for this supplier.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {supplier && !loading && !error &&
                                        items.map((item) => (
                                            <TableRow key={`${item.po_number}-${item.sku}`} className="hover:bg-muted/30">
                                                <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                                                <TableCell className="max-w-[220px] truncate" title={item.product_name}>
                                                    {item.product_name}
                                                </TableCell>
                                                <TableCell>{item.brand_name || '—'}</TableCell>
                                                <TableCell className="font-mono text-xs">{item.supplier_id}</TableCell>
                                                <TableCell>{item.supplier_name || '—'}</TableCell>
                                                <TableCell>{formatDate(item.po_released_at)}</TableCell>
                                                <TableCell>{formatDate(item.po_sent_at)}</TableCell>
                                                <TableCell>{formatDate(item.po_approved_at)}</TableCell>
                                                <TableCell>{formatDate(item.po_arrived_at)}</TableCell>
                                                <TableCell>{formatDate(item.po_received_at)}</TableCell>
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
