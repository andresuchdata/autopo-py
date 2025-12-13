import React, { useState, useEffect, useCallback } from 'react';
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Loader2, Download } from 'lucide-react';
import { getPOAging, POAgingItemsResponse, POAgingItem } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface POAgingTableProps {
    initialItems?: POAgingItem[];
}

const formatCurrency = (value: number) => {
    if (value >= 1000000000) {
        return `Rp ${(value / 1000000000).toFixed(2)} bio`;
    }
    if (value >= 1000000) {
        return `Rp ${(value / 1000000).toFixed(1)} mio`;
    }
    return `Rp ${value.toLocaleString()}`;
};

const formatDate = (value: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const POAgingTable: React.FC<POAgingTableProps> = ({ initialItems }) => {
    const [items, setItems] = useState<POAgingItem[]>(initialItems ?? []);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [sortField, setSortField] = useState('days_in_status');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [isDownloading, setIsDownloading] = useState(false);
    const [interactive, setInteractive] = useState(false);

    // Keep initial items in sync while still allowing fetched overrides
    useEffect(() => {
        if (interactive) {
            return;
        }
        setItems(initialItems ?? []);
        setTotal(initialItems?.length ?? 0);
    }, [initialItems, interactive]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // Force type assertion or check if response is array or object
            const res = await getPOAging({
                page,
                pageSize,
                sortField,
                sortDirection,
                status: statusFilter
            });

            // Handle both legacy array response (if backend fails to switch) and new object response
            if (Array.isArray(res)) {
                // Should not happen if backend updated correctly, but fallback
                setItems(res as any);
                setTotal(res.length);
            } else {
                const response = res as POAgingItemsResponse;
                setItems(response.items || []);
                setTotal(response.total || 0);
            }
        } catch (error) {
            console.error("Failed to load aging data", error);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, sortField, sortDirection, statusFilter]);

    useEffect(() => {
        if (!interactive) {
            return;
        }
        loadData();
    }, [interactive, loadData]);

    const enableInteractive = useCallback(() => {
        if (!interactive) {
            setInteractive(true);
        }
    }, [interactive]);

    const handleSort = (field: string) => {
        enableInteractive();
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const handleExport = async () => {
        if (isDownloading) return;
        enableInteractive();
        setIsDownloading(true);
        try {
            const res = await getPOAging({
                page: 1,
                pageSize: 10000,
                sortField,
                sortDirection,
                status: statusFilter
            });
            let allItems: POAgingItem[] = [];
            if (Array.isArray(res)) {
                allItems = res as any;
            } else {
                const response = res as POAgingItemsResponse;
                allItems = response.items || [];
            }

            if (allItems.length === 0) return;

            const headers = ['PO Number', 'Supplier', 'Status', 'Qty', 'Value', 'Days', 'Released', 'Sent', 'Arrived', 'Received'];
            const escape = (v: any) => {
                const s = v === null || v === undefined ? '' : String(v);
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            }
            const rows = allItems.map(i => [
                i.po_number, i.supplier_name, i.status, i.quantity, i.value, i.days_in_status,
                formatDate(i.po_released_at), formatDate(i.po_sent_at), formatDate(i.po_arrived_at), formatDate(i.po_received_at)
            ]);
            const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `po-aging-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
        } finally {
            setIsDownloading(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const SortIcon = ({ field }: { field: string }) => {
        if (sortField !== field) return null;
        return sortDirection === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
    };

    return (
        <div className="w-full bg-card rounded-lg p-4 border border-border flex flex-col gap-4">
            <div className="flex flex-row items-center justify-between">
                <h3 className="text-lg font-semibold">PO Aging vs. Today</h3>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || isDownloading}>
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                    <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
                        <SelectTrigger className="w-[180px] h-8">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Statuses</SelectItem>
                            <SelectItem value="Released">Released</SelectItem>
                            <SelectItem value="Sent">Sent</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                            <SelectItem value="Declined">Declined</SelectItem>
                            <SelectItem value="Arrived">Arrived</SelectItem>
                            <SelectItem value="Received">Received</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('po_number')}>
                                <div className="flex items-center">PO Number <SortIcon field="po_number" /></div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('supplier_name')}>
                                <div className="flex items-center">Supplier <SortIcon field="supplier_name" /></div>
                            </TableHead>
                            {statusFilter === 'ALL' && (
                                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('status')}>
                                    <div className="flex items-center">Status <SortIcon field="status" /></div>
                                </TableHead>
                            )}
                            <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('po_qty')}>
                                <div className="flex items-center justify-end">Qty <SortIcon field="po_qty" /></div>
                            </TableHead>
                            <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('value')}>
                                <div className="flex items-center justify-end">Value <SortIcon field="value" /></div>
                            </TableHead>
                            <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('days_in_status')}>
                                <div className="flex items-center justify-end">Days <SortIcon field="days_in_status" /></div>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={statusFilter === 'ALL' ? 6 : 5} className="h-24 text-center">
                                    <div className="flex justify-center items-center gap-2">
                                        <Loader2 className="h-6 w-6 animate-spin" /> Loading...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={statusFilter === 'ALL' ? 6 : 5} className="h-24 text-center text-muted-foreground">
                                    No aging POs found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((item, idx) => (
                                <TableRow key={`${item.po_number}-${idx}`}>
                                    <TableCell className="font-medium">{item.po_number}</TableCell>
                                    <TableCell>{item.supplier_name || '—'}</TableCell>
                                    {statusFilter === 'ALL' && (
                                        <TableCell>
                                            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                                                {item.status}
                                            </span>
                                        </TableCell>
                                    )}
                                    <TableCell className="text-right">{item.quantity.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(item.value)}</TableCell>
                                    <TableCell className="text-right font-mono font-medium text-orange-600">
                                        {item.days_in_status} d
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            enableInteractive();
                            setPage(p => Math.max(1, p - 1));
                        }}
                        disabled={page === 1 || loading}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            enableInteractive();
                            setPage(p => Math.min(totalPages, p + 1));
                        }}
                        disabled={page === totalPages || loading}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
};
