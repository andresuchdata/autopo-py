'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowLeft, Calendar as CalendarIcon, Save, Store as StoreIcon } from 'lucide-react';
import { getPODetails, updatePOETA, PODetail, POSnapshotItem } from '@/services/api';
import { getStatusColor } from '@/constants/poStatusColors';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { format } from 'date-fns';

interface PODetailPageProps {
    params: {
        poNumber: string;
    };
}

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value);

const formatDate = (value: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

export default function PODetailPage() {
    const params = useParams();
    const poNumber = params.poNumber as string;
    const router = useRouter();
    // const { toast } = useToast();
    const [po, setPO] = useState<PODetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [bulkETA, setBulkETA] = useState('');
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);
    const [isBulkOpen, setIsBulkOpen] = useState(false);
    const [editingItems, setEditingItems] = useState<Record<string, string>>({}); // sku -> eta

    // Pagination state
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const loadPO = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getPODetails(decodeURIComponent(poNumber));
            if (!data) {
                throw new Error('PO data not found');
            }

            setPO(data);
            setError(null);

            // Initialize editing state
            const initialEdits: Record<string, string> = {};
            data.items.forEach(item => {
                if (item.eta) {
                    initialEdits[item.sku] = item.eta; // YYYY-MM-DD format usually comes from API if formatted
                }
            });
            setEditingItems(initialEdits);

        } catch (err: any) {
            setError(err.message || 'Failed to load PO details');
        } finally {
            setLoading(false);
        }
    }, [poNumber]);

    useEffect(() => {
        loadPO();
    }, [loadPO]);

    const handleETAChange = (sku: string, value: string) => {
        setEditingItems(prev => ({ ...prev, [sku]: value }));
    };

    const saveSingleETA = async (sku: string) => {
        const eta = editingItems[sku];
        if (!eta) return;

        try {
            await updatePOETA(poNumber, eta, sku);
            alert(`ETA updated for SKU ${sku}`);
            // Refresh logic - simplified update mainly because we just updated one item
            // But good to reload to ensure consistency
            // Or just update local state if we want to be faster
        } catch (err: any) {
            alert(`Failed to update ETA: ${err.message}`);
        }
    };

    const handleBulkApply = async () => {
        if (!bulkETA) return;
        setIsBulkUpdating(true);
        try {
            await updatePOETA(poNumber, bulkETA);
            alert('ETA updated for all items');
            // Update all local state to reflect bulk change
            const newEdits: Record<string, string> = {};
            po?.items.forEach(item => {
                newEdits[item.sku] = bulkETA;
            });
            setEditingItems(newEdits);

            // Reload to get fresh server state
            await loadPO();
            setBulkETA(''); // Reset bulk input
            setIsBulkOpen(false); // Close dialog
        } catch (err: any) {
            alert(`Failed to bulk update ETA: ${err.message}`);
        } finally {
            setIsBulkUpdating(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !po) {
        return (
            <div className="p-8 text-center text-destructive">
                <p>Error: {error || 'PO not found'}</p>
                <Button variant="outline" onClick={() => router.back()} className="mt-4">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
                </Button>
            </div>
        );
    }

    const statusColor = getStatusColor(po.status);
    const isEditable = ['Sent', 'Approved'].includes(po.status); // Only editable in Sent or Approved status

    const allItems = po.items || [];
    const totalPages = Math.ceil(allItems.length / pageSize);
    const shownItems = allItems.slice((page - 1) * pageSize, page * pageSize);

    return (
        <div className="container mx-auto py-8">
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            PO {po.po_number}
                            <span
                                className="text-sm px-2 py-1 rounded-full text-white font-medium"
                                style={{ backgroundColor: statusColor }}
                            >
                                {po.status}
                            </span>
                        </h1>
                        <div className="flex flex-col gap-1 mt-1">
                            <p className="text-muted-foreground flex items-center gap-2">
                                {po.supplier_name}
                                {po.store_name && (
                                    <>
                                        <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                                        <span className="flex items-center gap-1.5 text-foreground/80 font-medium">
                                            <StoreIcon className="h-3.5 w-3.5" />
                                            {po.store_name}
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                {isEditable && (
                    <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                Bulk Apply ETA
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[40%]">
                            <DialogHeader>
                                <DialogTitle>Bulk Apply ETA</DialogTitle>
                                <DialogDescription>
                                    Set the same Estimated Time of Arrival for all items in this Purchase Order.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <Input
                                    type="date"
                                    value={bulkETA}
                                    onChange={(e) => setBulkETA(e.target.value)}
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => {
                                    setBulkETA('');
                                    setIsBulkOpen(false);
                                }}>Cancel</Button>
                                <Button onClick={handleBulkApply} disabled={isBulkUpdating || !bulkETA}>
                                    {isBulkUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Apply to All
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {/* PO Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="p-4 rounded-lg border bg-card">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Total Qty</span>
                    <div className="text-2xl font-bold mt-1">{po.po_qty.toLocaleString()}</div>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Total Value</span>
                    <div className="text-2xl font-bold mt-1">{formatCurrency(po.total_amount)}</div>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Sent Date</span>
                    <div className="text-lg font-medium mt-1">{formatDate(po.po_sent_at)}</div>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Approved Date</span>
                    <div className="text-lg font-medium mt-1">{formatDate(po.po_approved_at)}</div>
                </div>
            </div>

            {/* Items Table */}
            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>SKU</TableHead>
                            <TableHead>Product Name</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            {isEditable && <TableHead className="w-[200px]">ETA</TableHead>}
                            <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {shownItems.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={isEditable ? 7 : 6} className="h-24 text-center text-muted-foreground">
                                    No items found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            shownItems.map((item) => (
                                <TableRow key={item.sku}>
                                    <TableCell className="font-medium">{item.sku}</TableCell>
                                    <TableCell className="truncate max-w-[200px]" title={item.product_name}>{item.product_name}</TableCell>
                                    <TableCell className="text-right">{item.po_qty.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(item.total_amount)}</TableCell>
                                    {isEditable && (
                                        <TableCell>
                                            <Input
                                                type="date"
                                                value={editingItems[item.sku] || ''}
                                                onChange={(e) => handleETAChange(item.sku, e.target.value)}
                                                className="h-8"
                                            />
                                        </TableCell>
                                    )}
                                    <TableCell>
                                        {isEditable && editingItems[item.sku] !== item.eta && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 text-primary hover:text-primary/80"
                                                title="Save ETA"
                                                onClick={() => saveSingleETA(item.sku)}
                                            >
                                                <Save className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-4">
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <span>Rows per page</span>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(val) => {
                                setPageSize(Number(val));
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="h-8 w-[70px]">
                                <SelectValue placeholder={String(pageSize)} />
                            </SelectTrigger>
                            <SelectContent>
                                {[10, 20, 50, 100].map((size) => (
                                    <SelectItem key={size} value={String(size)}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <span className="hidden sm:inline-block w-px h-4 bg-border/60" />
                    <div>
                        Showing {Math.min(shownItems.length, pageSize)} of {allItems.length} items
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Page</span>
                        <Input
                            type="number"
                            min={1}
                            max={totalPages || 1}
                            value={page}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 1 && val <= (totalPages || 1)) {
                                    setPage(val);
                                }
                            }}
                            className="h-8 w-16 text-center"
                        />
                        <span className="text-sm text-muted-foreground">of {totalPages || 1}</span>
                    </div>

                    <Pagination className="w-auto mx-0">
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                />
                            </PaginationItem>
                            <PaginationItem>
                                <PaginationNext
                                    onClick={() => setPage(Math.min(totalPages || 1, page + 1))}
                                    className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            </div>
        </div>
    );
}
