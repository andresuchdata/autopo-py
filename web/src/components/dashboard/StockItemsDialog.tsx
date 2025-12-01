import { useState, useMemo, useCallback, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { COLORS, CONDITION_LABELS } from "./SummaryCards";
import { ConditionKey } from "@/services/dashboardService";
import { type StockHealthItemsResponse } from "@/services/stockHealthService";
import { type SummaryGrouping } from "@/types/stockHealth";

interface StockItem {
    id: number;
    store_name: string;
    sku_code: string;
    sku_name: string;
    brand_name: string;
    current_stock: number;
    days_of_cover: number;
    condition: ConditionKey;
    hpp: number;
    inventory_value: number;
}

interface StockItemsDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    condition: ConditionKey | null;
    grouping: SummaryGrouping | null;
    fetchItems: (params: { page: number; pageSize: number; grouping?: SummaryGrouping }) => Promise<StockHealthItemsResponse>;
}

type SortField = keyof StockItem;
type SortDirection = 'asc' | 'desc';

export function StockItemsDialog({
    isOpen,
    onOpenChange,
    condition,
    grouping,
    fetchItems,
}: StockItemsDialogProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [sortField, setSortField] = useState<SortField>('store_name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [items, setItems] = useState<StockItem[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const activeGrouping: SummaryGrouping = grouping ?? 'sku';

    useEffect(() => {
        if (activeGrouping === 'value') {
            setSortField('inventory_value');
            setSortDirection('desc');
        } else if (activeGrouping === 'stock') {
            setSortField('current_stock');
            setSortDirection('desc');
        } else {
            setSortField('store_name');
            setSortDirection('asc');
        }
    }, [activeGrouping]);

    const loadItems = useCallback(async (pageParam: number, pageSizeParam: number) => {
        if (!condition) {
            setItems([]);
            setTotalItems(0);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const response = await fetchItems({
                page: pageParam,
                pageSize: pageSizeParam,
                grouping: activeGrouping,
            });
            const normalizedItems: StockItem[] = response.items.map((item) => ({
                id: item.id,
                store_name: item.store_name,
                sku_code: item.sku_code,
                sku_name: item.product_name,
                brand_name: item.brand_name,
                current_stock: item.current_stock,
                days_of_cover: item.days_of_cover,
                condition: (item.stock_condition as ConditionKey) ?? 'out_of_stock',
                hpp: item.hpp ?? 0,
                inventory_value: (item.current_stock ?? 0) * (item.hpp ?? 0),
            }));

            setItems(normalizedItems);
            setTotalItems(response.total);
        } catch (err) {
            console.error('Failed to fetch stock items', err);
            setItems([]);
            setTotalItems(0);
            setError('Failed to load items');
        } finally {
            setIsLoading(false);
        }
    }, [condition, fetchItems, activeGrouping]);

    useEffect(() => {
        if (isOpen && condition) {
            setCurrentPage(1);
            loadItems(1, itemsPerPage);
        }

        if (!isOpen) {
            setItems([]);
            setTotalItems(0);
        }
    }, [isOpen, condition, itemsPerPage, loadItems, activeGrouping]);

    // Handle sorting
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Process items (sort and paginate)
    const processedItems = useMemo(() => {
        let sorted = [...items];

        sorted.sort((a, b) => {
            const aValue = a[sortField];
            const bValue = b[sortField];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return sortDirection === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
            }

            return 0;
        });

        return sorted;
    }, [items, sortField, sortDirection]);

    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    const handlePageChange = useCallback((nextPage: number) => {
        const clamped = Math.max(1, Math.min(totalPages, nextPage));
        setCurrentPage(clamped);
        loadItems(clamped, itemsPerPage);
    }, [itemsPerPage, loadItems, totalPages]);

    const handlePageSizeChange = (value: number) => {
        setItemsPerPage(value);
        setCurrentPage(1);
        loadItems(1, value);
    };

    const formatNumber = (value: number) => new Intl.NumberFormat('id-ID').format(value);
    const formatCurrency = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

    const groupingDescriptions: Record<SummaryGrouping, string> = {
        sku: 'individual SKU details',
        stock: 'total quantity details',
        value: 'inventory value details',
    };

    const metricConfig = activeGrouping === 'value'
        ? { label: 'Inventory Value', field: 'inventory_value' as SortField, render: (item: StockItem) => formatCurrency(item.inventory_value) }
        : {
            label: activeGrouping === 'stock' ? 'Total Qty' : 'Stock',
            field: 'current_stock' as SortField,
            render: (item: StockItem) => formatNumber(item.current_stock),
        };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] max-w-[95vw] sm:w-[80vw] sm:max-w-[80vw] h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div
                            className="h-4 w-4 rounded-full"
                            style={{ backgroundColor: condition ? COLORS[condition] : 'gray' }}
                        />
                        {condition && CONDITION_LABELS[condition]}
                    </DialogTitle>
                    <DialogDescription>
                        {condition
                            ? `Showing ${totalItems.toLocaleString()} items (${groupingDescriptions[activeGrouping]})`
                            : 'Select a condition to view items'}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-auto border rounded-md">
                    <Table>
                        <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                            <TableRow>
                                <SortableHeader label="Store" field="store_name" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
                                <SortableHeader label="SKU Code" field="sku_code" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
                                <SortableHeader label="SKU Name" field="sku_name" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
                                <SortableHeader label="Brand" field="brand_name" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
                                <SortableHeader label={metricConfig.label} field={metricConfig.field} currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                                <SortableHeader label="Days of Cover" field="days_of_cover" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                                {activeGrouping === 'value' && (
                                    <SortableHeader label="HPP" field="hpp" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        Loading items...
                                    </TableCell>
                                </TableRow>
                            ) : error ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-red-500">
                                        {error}
                                    </TableCell>
                                </TableRow>
                            ) : processedItems.length > 0 ? (
                                processedItems.map((item) => (
                                    <TableRow key={`${item.id}-${item.store_name}`} className="hover:bg-muted/50">
                                        <TableCell className="font-medium">{item.store_name}</TableCell>
                                        <TableCell className="font-mono text-xs">{item.sku_code}</TableCell>
                                        <TableCell className="max-w-[300px] truncate" title={item.sku_name}>{item.sku_name}</TableCell>
                                        <TableCell>{item.brand_name}</TableCell>
                                        <TableCell className="text-right font-mono">{metricConfig.render(item)}</TableCell>
                                        <TableCell className="text-right font-mono">{item.days_of_cover.toFixed(1)}</TableCell>
                                        {activeGrouping === 'value' && (
                                            <TableCell className="text-right font-mono">{formatCurrency(item.hpp)}</TableCell>
                                        )}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        No items found matching this criteria
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages} ({totalItems.toLocaleString()} items)
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            className="border rounded px-2 py-1 text-sm"
                            value={itemsPerPage}
                            onChange={(e) => {
                                handlePageSizeChange(Number(e.target.value));
                            }}
                        >
                            <option value={10}>10 per page</option>
                            <option value={20}>20 per page</option>
                            <option value={50}>50 per page</option>
                            <option value={100}>100 per page</option>
                        </select>
                        <div className="flex gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1 || isLoading}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages || isLoading}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function SortableHeader({
    label,
    field,
    currentSort,
    direction,
    onSort,
    align = 'left'
}: {
    label: string;
    field: SortField;
    currentSort: SortField;
    direction: SortDirection;
    onSort: (field: SortField) => void;
    align?: 'left' | 'right';
}) {
    return (
        <TableHead
            className={`cursor-pointer hover:bg-muted/50 transition-colors ${align === 'right' ? 'text-right' : ''}`}
            onClick={() => onSort(field)}
        >
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
                {label}
                <ArrowUpDown className={`h-3 w-3 ${currentSort === field ? 'opacity-100' : 'opacity-30'}`} />
            </div>
        </TableHead>
    );
}
