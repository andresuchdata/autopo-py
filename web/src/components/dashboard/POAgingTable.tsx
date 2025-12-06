import React, { useState, useEffect, useCallback } from 'react';
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
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

interface POAgingTableProps { }

const formatCurrency = (value: number) => {
    if (value >= 1000000000) {
        return `Rp ${(value / 1000000000).toFixed(2)} bio`;
    }
    if (value >= 1000000) {
        return `Rp ${(value / 1000000).toFixed(1)} mio`;
    }
    return `Rp ${value.toLocaleString()}`;
};

export const POAgingTable: React.FC<POAgingTableProps> = () => {
    const [items, setItems] = useState<POAgingItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [sortField, setSortField] = useState('days_in_status');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [statusFilter, setStatusFilter] = useState('ALL');

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
        loadData();
    }, [loadData]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
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
                    <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
                        <SelectTrigger className="w-[180px] h-8">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Statuses</SelectItem>
                            <SelectItem value="Released">Released</SelectItem>
                            <SelectItem value="Sent">Sent</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
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
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <div className="flex justify-center items-center gap-2">
                                        <Loader2 className="h-6 w-6 animate-spin" /> Loading...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No aging POs found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((item, idx) => (
                                <TableRow key={`${item.po_number}-${idx}`}>
                                    <TableCell className="font-medium">{item.po_number}</TableCell>
                                    <TableCell>{item.supplier_name || '—'}</TableCell>
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
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1 || loading}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages || loading}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
};
