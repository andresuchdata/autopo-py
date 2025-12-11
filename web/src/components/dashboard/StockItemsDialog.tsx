import { useState, useCallback, useEffect } from "react";
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
import { ChevronLeft, ChevronRight, ArrowUpDown, Download } from "lucide-react";
import { COLORS, CONDITION_LABELS } from "./SummaryCards";
import { ConditionKey } from "@/services/dashboardService";
import { type StockHealthItemsResponse, type StockHealthApiItem } from "@/services/stockHealthService";
import { type SummaryGrouping, type SortDirection, type StockItemsSortField } from "@/types/stockHealth";

interface StockItem {
    id: number;
    store_name: string;
    sku_code: string;
    sku_name: string;
    brand_name: string;
    kategori_brand?: string;
    current_stock: number;
    daily_sales: number;
    daily_stock_cover: number;
    condition: ConditionKey;
    hpp: number;
    inventory_value: number;
}

interface StockItemsDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    condition: ConditionKey | null;
    grouping: SummaryGrouping | null;
    fetchItems: (params: {
        page: number;
        pageSize: number;
        grouping?: SummaryGrouping;
        sortField?: StockItemsSortField;
        sortDirection?: SortDirection;
    }) => Promise<StockHealthItemsResponse>;
}

type SortField = StockItemsSortField;

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
    const [isDownloading, setIsDownloading] = useState(false);

    const activeGrouping: SummaryGrouping = grouping ?? 'sku';

    const normalizeApiItem = useCallback((item: StockHealthApiItem): StockItem => ({
        id: item.id,
        store_name: item.store_name,
        sku_code: item.sku_code,
        sku_name: item.product_name,
        brand_name: item.brand_name,
        kategori_brand: item.kategori_brand,
        current_stock: item.current_stock,
        daily_sales: item.daily_sales,
        daily_stock_cover: item.daily_stock_cover,
        condition: (item.stock_condition as ConditionKey) ?? 'out_of_stock',
        hpp: item.hpp ?? 0,
        inventory_value: (item.current_stock ?? 0) * (item.hpp ?? 0),
    }), []);

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

    const loadItems = useCallback(async (
        pageParam: number,
        pageSizeParam: number,
        customSortField?: SortField,
        customSortDirection?: SortDirection,
    ) => {
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
                sortField: customSortField ?? sortField,
                sortDirection: customSortDirection ?? sortDirection,
            });
            const normalizedItems: StockItem[] = response.items.map(normalizeApiItem);

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
    }, [condition, fetchItems, activeGrouping, sortField, sortDirection, normalizeApiItem]);

    useEffect(() => {
        if (isOpen && condition) {
            setCurrentPage(1);
            loadItems(1, itemsPerPage);
        }

        if (!isOpen) {
            setItems([]);
            setTotalItems(0);
        }
    }, [isOpen, condition, itemsPerPage, loadItems]);

    const handleSort = (field: SortField) => {
        const isSameField = sortField === field;
        const nextDirection: SortDirection = isSameField && sortDirection === 'asc' ? 'desc' : 'asc';
        const nextField = isSameField ? field : field;
        setSortField(nextField);
        setSortDirection(nextDirection);
        setCurrentPage(1);
        loadItems(1, itemsPerPage, nextField, nextDirection);
    };

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

    const fetchAllItemsForDownload = useCallback(async () => {
        if (!condition) {
            return [] as StockItem[];
        }

        const aggregated: StockItem[] = [];
        const pageSize = 500;
        let page = 1;
        let total = Infinity;

        while (aggregated.length < total) {
            const response = await fetchItems({
                page,
                pageSize,
                grouping: activeGrouping,
                sortField,
                sortDirection,
            });

            if (!response.items.length) {
                break;
            }

            aggregated.push(...response.items.map(normalizeApiItem));
            total = response.total ?? aggregated.length;

            if (response.items.length < pageSize) {
                break;
            }

            page += 1;
        }

        return aggregated;
    }, [condition, fetchItems, activeGrouping, sortField, sortDirection, normalizeApiItem]);

    const handleDownload = useCallback(async () => {
        if (!condition || isDownloading) {
            return;
        }

        setIsDownloading(true);
        try {
            const allItems = await fetchAllItemsForDownload();
            if (allItems.length === 0) {
                setError('No items available to download');
                return;
            }

            const headers = [
                'Store',
                'SKU Code',
                'SKU Name',
                'Brand',
                'Kategori Brand',
                'Current Stock',
                'Daily Sales',
                'Daily Stock Cover',
                'HPP',
                'Inventory Value',
                'Condition',
            ];

            const escapeCsvValue = (value: string | number) => {
                const stringValue = `${value ?? ''}`;
                if (/[",\n]/.test(stringValue)) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            };

            const rows = allItems.map((item) => [
                item.store_name,
                item.sku_code,
                item.sku_name,
                item.brand_name,
                item.kategori_brand ?? '',
                item.current_stock,
                item.daily_sales,
                item.daily_stock_cover.toFixed(2),
                item.hpp,
                item.inventory_value,
                CONDITION_LABELS[item.condition] ?? item.condition,
            ]);

            const csvContent = [headers, ...rows]
                .map((row) => row.map(escapeCsvValue).join(','))
                .join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const datePart = new Date().toISOString().split('T')[0];
            link.download = `stock-items-${condition}-${activeGrouping}-${datePart}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (downloadError) {
            console.error('Failed to download stock items CSV', downloadError);
            setError('Failed to download CSV');
        } finally {
            setIsDownloading(false);
        }
    }, [condition, activeGrouping, fetchAllItemsForDownload, isDownloading, setError]);

    const formatDecimal = (value: number) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const formatCurrency = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

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
            render: (item: StockItem) => formatDecimal(item.current_stock),
        };

    const columnCount = 8 + (activeGrouping === 'value' ? 2 : 0);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] max-w-[95vw] sm:w-[80vw] sm:max-w-[80vw] h-[90vh] flex flex-col">
                <DialogHeader>
                    <div className="flex flex-col gap-3">
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
                        {condition && (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="text-sm text-muted-foreground">
                                    Download CSV for the current filters ({activeGrouping}) and sorting.
                                </span>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="gap-1"
                                    onClick={handleDownload}
                                    disabled={isLoading || isDownloading}
                                >
                                    <Download className="h-4 w-4" />
                                    {isDownloading ? 'Preparing…' : 'Download CSV'}
                                </Button>
                            </div>
                        )}
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-auto border rounded-md">
                    <Table>
                        <TableHeader className="sticky top-0 bg-white dark:bg-gray-800 z-10 shadow-sm">
                            <TableRow>
                                <SortableHeader label="Store" field="store_name" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
                                <SortableHeader label="SKU Code" field="sku_code" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
                                <SortableHeader label="SKU Name" field="sku_name" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
                                <SortableHeader label="Brand" field="brand_name" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
                                <TableHead>Kategori Brand</TableHead>
                                <SortableHeader label="Qty" field="current_stock" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                                <SortableHeader label="Daily Sales" field="daily_sales" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
                                <SortableHeader label="Daily Stock Cover" field="daily_stock_cover" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                                <SortableHeader label="HPP" field="hpp" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                                <SortableHeader label="Inventory Value" field="inventory_value" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={columnCount} className="text-center py-8 text-muted-foreground">
                                        Loading items...
                                    </TableCell>
                                </TableRow>
                            ) : error ? (
                                <TableRow>
                                    <TableCell colSpan={columnCount} className="text-center py-8 text-red-500">
                                        {error}
                                    </TableCell>
                                </TableRow>
                            ) : items.length > 0 ? (
                                items.map((item) => (
                                    <TableRow key={`${item.id}-${item.store_name}`} className="hover:bg-muted/50">
                                        <TableCell className="font-medium">{item.store_name}</TableCell>
                                        <TableCell className="font-mono text-xs">{item.sku_code}</TableCell>
                                        <TableCell className="max-w-[300px] truncate" title={item.sku_name}>{item.sku_name}</TableCell>
                                        <TableCell className="max-w-[300px] truncate" title={item.brand_name}>{item.brand_name}</TableCell>
                                        <TableCell className="max-w-[260px] truncate" title={item.kategori_brand ?? ''}>{item.kategori_brand ?? '-'}</TableCell>
                                        <TableCell className="text-right font-mono">{item.current_stock}</TableCell>
                                        <TableCell className="text-right font-mono">{item.daily_sales}</TableCell>
                                        <TableCell className="text-right font-mono">{formatDecimal(item.daily_stock_cover)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(item.hpp)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(item.inventory_value)}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={columnCount} className="text-center py-8 text-muted-foreground">
                                        No items found.
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
