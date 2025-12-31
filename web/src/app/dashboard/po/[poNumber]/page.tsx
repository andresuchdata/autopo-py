'use client';

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
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
import { DatePicker } from '@/components/ui/date-picker';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowLeft, Calendar as CalendarIcon, Save, Store as StoreIcon, Search, ArrowUpDown, RefreshCw, X } from 'lucide-react';
import { getPODetails, updatePOETA, PODetail, invalidatePODetailsCache } from '@/services/api';
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
import { useDebounce } from 'use-debounce';

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

// Simple Checkbox Component
const Checkbox = ({
    checked,
    indeterminate,
    onChange,
    disabled = false
}: {
    checked: boolean;
    indeterminate?: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}) => {
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (ref.current) {
            ref.current.indeterminate = !!indeterminate;
        }
    }, [indeterminate]);

    return (
        <div className="flex items-center justify-center p-1">
            <input
                type="checkbox"
                ref={ref}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
            />
        </div>
    );
};

export default function PODetailPage() {
    const params = useParams();
    const poNumber = params.poNumber as string;
    const router = useRouter();
    const [po, setPO] = useState<PODetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [bulkETA, setBulkETA] = useState('');
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);
    const [isBulkOpen, setIsBulkOpen] = useState(false);
    const [editingItems, setEditingItems] = useState<Record<string, string>>({}); // sku -> eta
    const [refreshing, setRefreshing] = useState(false);

    // Selection State
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [selectionModeETA, setSelectionModeETA] = useState('');

    // Pagination & Filter state
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebounce(search, 500);
    const [sortField, setSortField] = useState('sku');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const loadPO = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getPODetails({
                poNumber: decodeURIComponent(poNumber),
                page,
                pageSize,
                search: debouncedSearch,
                sortField,
                sortDirection
            });

            if (!data) {
                throw new Error('PO data not found');
            }

            setPO(data);
            setError(null);

            // Initialize editing state
            const initialEdits: Record<string, string> = {};
            data.items.forEach(item => {
                if (item.eta) {
                    initialEdits[item.sku] = item.eta;
                }
            });
            setEditingItems(initialEdits);

            // Clear selection on page/filter change naturally happened if items changes
            setSelectedSkus(new Set());

        } catch (err: any) {
            setError(err.message || 'Failed to load PO details');
        } finally {
            setLoading(false);
        }
    }, [poNumber, page, pageSize, debouncedSearch, sortField, sortDirection]);

    useEffect(() => {
        loadPO();
    }, [loadPO]);

    // Reset page on filter change
    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, pageSize]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const handleETAChange = (sku: string, value: string) => {
        setEditingItems(prev => ({ ...prev, [sku]: value }));
    };

    const saveSingleETA = async (sku: string) => {
        const eta = editingItems[sku];
        if (!eta) return;

        try {
            await updatePOETA(poNumber, eta, sku);
            // Refresh to ensure consistency
            loadPO();
        } catch (err: any) {
            alert(`Failed to update ETA: ${err.message}`);
        }
    };

    const handleBulkApply = async () => {
        if (!bulkETA) return;
        setIsBulkUpdating(true);
        try {
            await updatePOETA(poNumber, bulkETA);
            setBulkETA('');
            setIsBulkOpen(false);
            loadPO();
            alert('ETA updated for all items');
        } catch (err: any) {
            alert(`Failed to bulk update ETA: ${err.message}`);
        } finally {
            setIsBulkUpdating(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await invalidatePODetailsCache(poNumber);
            await loadPO();
        } catch (err: any) {
            console.error('Failed to refresh PO details:', err);
            // Optionally show a toast here
        } finally {
            setRefreshing(false);
        }
    };

    // Selection Logic
    const items = po?.items || [];
    const isEditable = po && ['Sent', 'Approved'].includes(po.status);

    const isAllSelected = useMemo(() => {
        if (items.length === 0) return false;
        return items.every(item => selectedSkus.has(item.sku));
    }, [items, selectedSkus]);

    const isIndeterminate = useMemo(() => {
        if (items.length === 0) return false;
        const selectedCount = items.filter(item => selectedSkus.has(item.sku)).length;
        return selectedCount > 0 && selectedCount < items.length;
    }, [items, selectedSkus]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const newSet = new Set(selectedSkus);
            items.forEach(item => newSet.add(item.sku));
            setSelectedSkus(newSet);
        } else {
            const newSet = new Set(selectedSkus);
            items.forEach(item => newSet.delete(item.sku));
            setSelectedSkus(newSet);
        }
    };

    const handleSelectRow = (sku: string, checked: boolean) => {
        const newSet = new Set(selectedSkus);
        if (checked) {
            newSet.add(sku);
        } else {
            newSet.delete(sku);
        }
        setSelectedSkus(newSet);
    };

    const handlePartialApply = async () => {
        if (!selectionModeETA || selectedSkus.size === 0) return;
        setIsBulkUpdating(true);
        try {
            const promises = Array.from(selectedSkus).map(sku => updatePOETA(poNumber, selectionModeETA, sku));
            await Promise.all(promises);

            setSelectionModeETA('');
            setSelectedSkus(new Set()); // Clear selection
            loadPO();
            alert(`ETA updated for ${selectedSkus.size} items`);
        } catch (err: any) {
            alert(`Failed to update some items: ${err.message}`);
            loadPO(); // Reload anyway
        } finally {
            setIsBulkUpdating(false);
        }
    };

    if (loading && !po) {
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
    const totalPages = po.total_pages || 1;
    const totalItems = po.total_items || items.length;

    return (
        <div className="container mx-auto py-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            PO {po.po_number}
                            <span
                                className="text-sm px-2 py-0.5 rounded-full text-white font-medium align-middle"
                                style={{ backgroundColor: statusColor }}
                            >
                                {po.status}
                            </span>
                        </h1>
                        <div className="flex flex-col gap-1 mt-1">
                            <p className="text-muted-foreground flex items-center gap-2 text-sm">
                                {po.supplier_name}
                                {po.store_name && (
                                    <>
                                        <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                                        <span className="flex items-center gap-1.5 text-foreground/80 font-medium">
                                            <StoreIcon className="h-3 w-3" />
                                            {po.store_name}
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto h-9">
                    {/* Header Actions - Switch based on selection */}
                    {selectedSkus.size > 0 ? (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300 bg-primary/5 rounded-md p-1 px-2 border border-primary/20">
                            <div className="text-sm font-medium text-primary whitespace-nowrap px-2 border-r border-primary/20 mr-2">
                                {selectedSkus.size} Selected
                            </div>
                            <DatePicker
                                value={selectionModeETA}
                                onChange={(val) => setSelectionModeETA(val)}
                                placeholder="Select ETA"
                                className="w-[140px] h-8 text-xs"
                            />
                            {selectionModeETA && (
                                <Button size="sm" onClick={handlePartialApply} disabled={isBulkUpdating} className="h-8">
                                    {isBulkUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedSkus(new Set())}
                                className="h-8 px-2 hover:bg-primary/10 text-muted-foreground hover:text-primary"
                                title="Clear Selection"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="relative w-full md:w-[300px]">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search SKU or product..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-9 h-9"
                                />
                            </div>
                            <Button
                                onClick={handleRefresh}
                                disabled={refreshing || loading}
                                variant="outline"
                                size="sm"
                                className="gap-2 h-9"
                            >
                                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                                {refreshing ? 'Refreshing...' : 'Refresh Data'}
                            </Button>
                            {isEditable && (
                                <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" className="whitespace-nowrap h-9">
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            Bulk ETA
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[400px]">
                                        <DialogHeader>
                                            <DialogTitle>Bulk Apply ETA</DialogTitle>
                                            <DialogDescription>
                                                Set ETA for all items in this PO.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="py-4">
                                            <DatePicker
                                                value={bulkETA}
                                                onChange={(val) => setBulkETA(val)}
                                                placeholder="Select ETA"
                                                className="w-full"
                                            />
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setIsBulkOpen(false)}>Cancel</Button>
                                            <Button onClick={handleBulkApply} disabled={isBulkUpdating || !bulkETA}>
                                                {isBulkUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                Apply
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Compact Info Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border bg-card">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Qty</span>
                    <div className="text-xl font-bold mt-0.5">{po.po_qty.toLocaleString()}</div>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Value</span>
                    <div className="text-xl font-bold mt-0.5">{formatCurrency(po.total_amount)}</div>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Sent Date</span>
                    <div className="text-sm font-medium mt-0.5 truncate">{formatDate(po.po_sent_at)}</div>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Approved Date</span>
                    <div className="text-sm font-medium mt-0.5 truncate">{formatDate(po.po_approved_at)}</div>
                </div>
            </div>

            {/* Items Table */}
            <div className="rounded-md border bg-card relative">
                {loading && (
                    <div className="absolute inset-0 bg-background/50 z-10 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40px] text-center">
                                {isEditable && (
                                    <Checkbox
                                        checked={isAllSelected}
                                        indeterminate={isIndeterminate}
                                        onChange={handleSelectAll}
                                    />
                                )}
                            </TableHead>
                            <TableHead
                                className="cursor-pointer hover:bg-muted/50 transition-colors w-[150px]"
                                onClick={() => handleSort('sku')}
                            >
                                <div className="flex items-center gap-1">
                                    SKU
                                    {sortField === 'sku' && <ArrowUpDown className="h-3 w-3" />}
                                </div>
                            </TableHead>
                            <TableHead
                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => handleSort('product_name')}
                            >
                                <div className="flex items-center gap-1">
                                    Product Name
                                    {sortField === 'product_name' && <ArrowUpDown className="h-3 w-3" />}
                                </div>
                            </TableHead>
                            <TableHead className="text-right w-[100px]">Qty</TableHead>
                            <TableHead className="text-right w-[120px]">Unit Price</TableHead>
                            <TableHead
                                className="text-right cursor-pointer hover:bg-muted/50 transition-colors w-[150px]"
                                onClick={() => handleSort('total_amount')}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    Total
                                    {sortField === 'total_amount' && <ArrowUpDown className="h-3 w-3" />}
                                </div>
                            </TableHead>
                            {isEditable && <TableHead className="w-[180px]">ETA</TableHead>}
                            <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={isEditable ? 8 : 7} className="h-32 text-center text-muted-foreground">
                                    {search ? 'No items match your search.' : 'No items found.'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((item) => (
                                <TableRow key={item.sku} data-state={selectedSkus.has(item.sku) ? "selected" : undefined}>
                                    <TableCell className="text-center">
                                        {isEditable && (
                                            <Checkbox
                                                checked={selectedSkus.has(item.sku)}
                                                onChange={(checked) => handleSelectRow(item.sku, checked)}
                                            />
                                        )}
                                    </TableCell>
                                    <TableCell className="font-medium text-xs">{item.sku}</TableCell>
                                    <TableCell className="text-sm max-w-[300px]" title={item.product_name}>
                                        <div className="truncate">{item.product_name}</div>
                                    </TableCell>
                                    <TableCell className="text-right text-sm">{item.po_qty.toLocaleString()}</TableCell>
                                    <TableCell className="text-right text-sm">{formatCurrency(item.unit_price)}</TableCell>
                                    <TableCell className="text-right text-sm font-medium">{formatCurrency(item.total_amount)}</TableCell>
                                    {isEditable && (
                                        <TableCell>
                                            <DatePicker
                                                value={editingItems[item.sku] || ''}
                                                onChange={(val) => handleETAChange(item.sku, val)}
                                                placeholder="Set ETA"
                                                className="h-8 w-[140px] text-xs px-2"
                                            />
                                        </TableCell>
                                    )}
                                    <TableCell>
                                        {isEditable && editingItems[item.sku] !== item.eta && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-7 w-7 text-primary hover:text-primary/80"
                                                title="Save ETA"
                                                onClick={() => saveSingleETA(item.sku)}
                                            >
                                                <Save className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border/40 pt-4 gap-4">
                <div className="flex items-center gap-6 text-xs text-muted-foreground w-full sm:w-auto justify-between sm:justify-start">
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
                    <div className="hidden sm:block">
                        Showing {items.length > 0 ? ((page - 1) * pageSize) + 1 : 0} to {Math.min(page * pageSize, totalItems)} of {totalItems} items
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Page</span>
                        <Input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={page}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 1 && val <= totalPages) {
                                    setPage(val);
                                }
                            }}
                            className="h-8 w-16 text-center"
                        />
                        <span className="text-sm text-muted-foreground">of {totalPages}</span>
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
                                    onClick={() => setPage(Math.min(totalPages, page + 1))}
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
