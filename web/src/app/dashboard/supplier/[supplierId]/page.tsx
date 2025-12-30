'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination"
import { Loader2, ArrowLeft, Search as SearchIcon, Filter as FilterIcon, Store as StoreIcon } from 'lucide-react';
import { GenericFilter } from '@/components/GenericFilter';
import { getSupplierDetails, PODetail, poService } from '@/services/api';
import { useDebounce } from 'use-debounce';

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

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

export default function SupplierDetailPage() {
    const params = useParams();
    const router = useRouter();
    const supplierId = params.supplierId as string;

    const searchParams = useSearchParams();
    const pathname = usePathname();

    const [pos, setPos] = useState<PODetail[]>([]);
    const [supplier, setSupplier] = useState<{ id: number; name: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [metadata, setMetadata] = useState({
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
    });
    const [stores, setStores] = useState<{ id: number; name: string }[]>([]);

    // Get filters from URL
    const page = Number(searchParams.get('page')) || 1;
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const storeId = searchParams.get('store_id') ? Number(searchParams.get('store_id')) : undefined;

    // Local state for inputs to allow debouncing/controlled components
    const [searchTerm, setSearchTerm] = useState(search);
    const [debouncedSearch] = useDebounce(searchTerm, 500);

    // Sync search term with URL when URL changes explicitly (e.g. navigation)
    useEffect(() => {
        setSearchTerm(search);
    }, [search]);

    // Update URL when filters change
    const updateFilters = useCallback((newParams: Record<string, string | number | null>) => {
        const current = new URLSearchParams(Array.from(searchParams.entries()));

        Object.entries(newParams).forEach(([key, value]) => {
            if (value === null || value === '' || value === undefined) {
                current.delete(key);
            } else {
                current.set(key, String(value));
            }
        });

        // Reset page to 1 if filter changes (unless page is explicitly updated)
        if (!newParams.page) {
            current.set('page', '1');
        }

        const searchString = current.toString();
        const query = searchString ? `?${searchString}` : '';
        router.push(`${pathname}${query}`);
    }, [searchParams, pathname, router]);

    // Load stores for filter
    useEffect(() => {
        const fetchStores = async () => {
            try {
                const data = await poService.getStores();
                setStores(data);
            } catch (err) {
                console.error('Failed to load stores', err);
            }
        };
        fetchStores();
    }, []);

    // Effect to update URL when debounced search changes
    useEffect(() => {
        if (debouncedSearch !== search) {
            updateFilters({ search: debouncedSearch });
        }
    }, [debouncedSearch, search, updateFilters]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const id = parseInt(supplierId, 10);
            if (isNaN(id)) {
                throw new Error('Invalid supplier ID');
            }

            const data = await getSupplierDetails({
                supplierId: id,
                page,
                pageSize: 20,
                storeId,
                search,
                status: status !== 'ALL' ? status : undefined,
            });

            setSupplier(data.supplier);
            setPos(data.pos);
            setMetadata({
                total: data.total,
                page: data.page,
                pageSize: data.page_size,
                totalPages: data.total_pages,
            });
            setError(null);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to load supplier details');
        } finally {
            setLoading(false);
        }
    }, [supplierId, page, storeId, search, status]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    if (error) {
        return (
            <div className="p-8 text-center text-destructive">
                <p>Error: {error}</p>
                <Button variant="outline" onClick={() => router.back()} className="mt-4">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">Supplier: {supplier?.name || `ID ${supplierId}`}</h1>
                    <p className="text-muted-foreground">Purchase Order History</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 p-4 rounded-lg border bg-card items-start md:items-center">
                <div className="relative flex-1 max-w-sm">
                    <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search PO number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                    />
                </div>

                <div className="w-full md:w-[200px]">
                    <Select
                        value={status || "ALL"}
                        onValueChange={(val) => updateFilters({ status: val === "ALL" ? null : val })}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Filter by Status" />
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

                <div className="w-full md:w-[250px]">
                    <GenericFilter
                        mode="single"
                        selected={storeId ? String(storeId) : null}
                        onChange={(val) => updateFilters({ store_id: val ? Number(val) : null })}
                        options={stores.map(s => ({ id: String(s.id), label: s.name }))}
                        placeholder="Filter by Store"
                        searchable={true}
                        triggerClassName="h-10 min-h-0"
                    />
                </div>

                <div className="flex items-center ml-auto">
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setSearchTerm('');
                            router.push(`${pathname}`);
                        }}
                        disabled={!search && !status && !storeId}
                    >
                        Reset Filters
                    </Button>
                </div>
            </div>

            <div className="rounded-md border bg-card relative">
                {loading && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>PO Number</TableHead>
                            <TableHead>Store</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Total Qty</TableHead>
                            <TableHead className="text-right">Total Amount</TableHead>
                            <TableHead className="text-right">Released Date</TableHead>
                            <TableHead className="text-right">Sent Date</TableHead>
                            <TableHead className="text-right">Approved Date</TableHead>
                            <TableHead className="text-right">Received Date</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!loading && pos.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                    No purchase orders found matching your filters.
                                </TableCell>
                            </TableRow>
                        ) : (
                            pos.map((po) => (
                                <TableRow key={po.po_number}>
                                    <TableCell className="font-medium">
                                        <a href={`/dashboard/po/${encodeURIComponent(po.po_number)}`} className="text-primary hover:underline">
                                            {po.po_number}
                                        </a>
                                    </TableCell>
                                    <TableCell>{po.store_name || '-'}</TableCell>
                                    <TableCell>
                                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent 
                                            ${po.status === 'Released' ? 'bg-blue-100 text-blue-800' :
                                                po.status === 'Approved' ? 'bg-green-100 text-green-800' :
                                                    po.status === 'Sent' ? 'bg-yellow-100 text-yellow-800' :
                                                        po.status === 'Declined' ? 'bg-red-100 text-red-800' :
                                                            'bg-secondary text-secondary-foreground'}`}>
                                            {po.status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">{po.po_qty.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(po.total_amount)}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {formatDate(po.po_released_at)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {formatDate(po.po_sent_at)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {formatDate(po.po_approved_at)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {formatDate(po.po_received_at)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {metadata.totalPages > 1 && (
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                onClick={() => updateFilters({ page: Math.max(1, page - 1) })}
                                className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                        </PaginationItem>

                        {Array.from({ length: Math.min(5, metadata.totalPages) }).map((_, i) => {
                            // Logic to show window of pages around current page
                            let p = page;
                            if (metadata.totalPages <= 5) {
                                p = i + 1;
                            } else if (page < 3) {
                                p = i + 1;
                            } else if (page > metadata.totalPages - 2) {
                                p = metadata.totalPages - 4 + i;
                            } else {
                                p = page - 2 + i;
                            }

                            return (
                                <PaginationItem key={p}>
                                    <PaginationLink
                                        isActive={p === page}
                                        onClick={() => updateFilters({ page: p })}
                                        className="cursor-pointer"
                                    >
                                        {p}
                                    </PaginationLink>
                                </PaginationItem>
                            );
                        })}

                        <PaginationItem>
                            <PaginationNext
                                onClick={() => updateFilters({ page: Math.min(metadata.totalPages, page + 1) })}
                                className={page === metadata.totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}
        </div>
    );
}
