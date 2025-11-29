import { useState, useMemo } from "react";
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

interface StockItem {
    id: number;
    store_name: string;
    sku_code: string;
    sku_name: string;
    brand_name: string;
    current_stock: number;
    days_of_cover: number;
    condition: ConditionKey;
}

interface StockItemsDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    items: StockItem[];
    condition: ConditionKey | null;
    isLoading: boolean;
}

type SortField = keyof StockItem;
type SortDirection = 'asc' | 'desc';

export function StockItemsDialog({
    isOpen,
    onOpenChange,
    items,
    condition,
    isLoading,
}: StockItemsDialogProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [sortField, setSortField] = useState<SortField>('store_name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

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

    // Pagination logic
    const totalPages = Math.ceil(processedItems.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = processedItems.slice(startIndex, startIndex + itemsPerPage);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="w-[80vw] max-w-[80vw] h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div
                            className="h-4 w-4 rounded-full"
                            style={{ backgroundColor: condition ? COLORS[condition] : 'gray' }}
                        />
                        {condition && CONDITION_LABELS[condition]}
                    </DialogTitle>
                    <DialogDescription>
                        Showing {items.length} items
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
                                <SortableHeader label="Stock" field="current_stock" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                                <SortableHeader label="Days of Cover" field="days_of_cover" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        Loading items...
                                    </TableCell>
                                </TableRow>
                            ) : paginatedItems.length > 0 ? (
                                paginatedItems.map((item) => (
                                    <TableRow key={item.id} className="hover:bg-muted/50">
                                        <TableCell className="font-medium">{item.store_name}</TableCell>
                                        <TableCell className="font-mono text-xs">{item.sku_code}</TableCell>
                                        <TableCell className="max-w-[300px] truncate" title={item.sku_name}>{item.sku_name}</TableCell>
                                        <TableCell>{item.brand_name}</TableCell>
                                        <TableCell className="text-right font-mono">{item.current_stock}</TableCell>
                                        <TableCell className="text-right font-mono">{item.days_of_cover.toFixed(1)}</TableCell>
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
                        Page {currentPage} of {totalPages} ({items.length} items)
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            className="border rounded px-2 py-1 text-sm"
                            value={itemsPerPage}
                            onChange={(e) => {
                                setItemsPerPage(Number(e.target.value));
                                setCurrentPage(1);
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
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
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
