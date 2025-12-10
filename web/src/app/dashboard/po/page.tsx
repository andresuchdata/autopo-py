'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Store as StoreIcon, Tag, Filter as FilterIcon } from 'lucide-react';
import { POStatusCard } from '@/components/dashboard/POStatusCard';
import { POFunnelChart } from '@/components/dashboard/POFunnelChart';
import { POTrendChart } from '@/components/dashboard/POTrendChart';
import { POAgingTable } from '@/components/dashboard/POAgingTable';
import { SupplierPerformanceChart } from '@/components/dashboard/SupplierPerformanceChart';
import { getDashboardSummary, type DashboardSummaryParams, poService } from '@/services/api';
import { POSnapshotDialog } from '@/components/dashboard/POSnapshotDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DatePicker } from '@/components/ui/date-picker';
import { PODashboardFilterProvider, usePODashboardFilter } from '@/contexts/PODashboardFilterContext';

interface DashboardData {
    status_summaries: any[];
    lifecycle_funnel: any[];
    trends: any[];
    aging: any[];
    supplier_performance: any[];
}

function PODashboardContent() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const { poTypeFilter, setPOTypeFilter, releasedDateFilter, setReleasedDateFilter, storeIdsFilter, setStoreIdsFilter, brandIdsFilter, setBrandIdsFilter } = usePODashboardFilter();
    const [stores, setStores] = useState<{ id: number; name: string }[]>([]);
    const [brands, setBrands] = useState<{ id: number; name: string }[]>([]);
    const [storeSearch, setStoreSearch] = useState('');
    const [brandSearch, setBrandSearch] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const params: DashboardSummaryParams = {};
                if (poTypeFilter !== 'ALL') {
                    params.poType = poTypeFilter;
                }
                if (releasedDateFilter) {
                    params.releasedDate = releasedDateFilter;
                }
                if (storeIdsFilter.length > 0) {
                    params.storeIds = storeIdsFilter;
                }
                if (brandIdsFilter.length > 0) {
                    params.brandIds = brandIdsFilter;
                }
                const result = await getDashboardSummary(params);
                setData(result);
            } catch (err) {
                console.error(err);
                setError('Failed to load dashboard data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [poTypeFilter, releasedDateFilter, storeIdsFilter, brandIdsFilter]);

    useEffect(() => {
        const loadInitialOptions = async () => {
            try {
                const [storesRes, brandsRes] = await Promise.all([
                    poService.getStores(),
                    poService.getBrands(),
                ]);
                setStores(storesRes.data ?? storesRes);
                setBrands(brandsRes.data ?? brandsRes);
            } catch (err) {
                console.error('Failed to load store/brand options', err);
            }
        };

        loadInitialOptions();
    }, []);

    const storeOptions = useMemo(() => stores.map((s) => ({ id: s.id, label: s.name })), [stores]);
    const brandOptions = useMemo(() => brands.map((b) => ({ id: b.id, label: b.name })), [brands]);

    const selectedStoresLabel = useMemo(() => {
        if (storeIdsFilter.length === 0) return 'All Stores';
        if (storeIdsFilter.length === 1) {
            const match = storeOptions.find((s) => s.id === storeIdsFilter[0]);
            return match?.label ?? '1 store selected';
        }
        return `${storeIdsFilter.length} stores selected`;
    }, [storeIdsFilter, storeOptions]);

    const selectedBrandsLabel = useMemo(() => {
        if (brandIdsFilter.length === 0) return 'All Brands';
        if (brandIdsFilter.length === 1) {
            const match = brandOptions.find((b) => b.id === brandIdsFilter[0]);
            return match?.label ?? '1 brand selected';
        }
        return `${brandIdsFilter.length} brands selected`;
    }, [brandIdsFilter, brandOptions]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
                <div className="text-red-500">{error || 'No data available'}</div>
            </div>
        );
    }

    // Define the desired order for PO status cards
    const statusOrder = ['Released', 'Sent', 'Approved', 'Declined', 'Arrived', 'Received'];

    const rawSummaries = data.status_summaries ?? [];
    const summariesByStatus = rawSummaries.reduce<Record<string, any>>((acc, summary) => {
        acc[summary.status] = summary;
        return acc;
    }, {});

    // Ensure we always render cards for the known statuses even if the API returns zero data
    const orderedSummaries = statusOrder.map((status) => {
        return summariesByStatus[status] ?? {
            status,
            count: 0,
            total_value: 0,
            sku_count: 0,
            total_qty: 0,
            avg_days: 0,
            diff_days: 0
        };
    });

    // Append any additional statuses that weren't in the predefined order
    const extraSummaries = rawSummaries.filter((summary: any) => !statusOrder.includes(summary.status));

    const statusSummaries = [...orderedSummaries, ...extraSummaries];

    const funnelData = data.lifecycle_funnel ?? [];
    const trendData = data.trends ?? [];
    const agingData = data.aging ?? [];
    const supplierPerformanceData = data.supplier_performance ?? [];

    return (
        <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex items-start gap-3">
                    <div className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg bg-muted text-muted-foreground border border-border/60">
                        <FilterIcon className="h-4 w-4" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Purchase Orders Dashboard</h1>
                        <p className="text-sm text-muted-foreground">Filter by PO type, store, brand, and released date to focus the insights.</p>
                    </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex flex-col gap-1">
                        <Label className="text-xs font-medium uppercase text-muted-foreground">PO Type</Label>
                        <Select value={poTypeFilter} onValueChange={(value: 'ALL' | 'AU' | 'PO' | 'OTHERS') => setPOTypeFilter(value)}>
                            <SelectTrigger className="w-40 h-10 bg-background border-border rounded-lg">
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All</SelectItem>
                                <SelectItem value="AU">AU</SelectItem>
                                <SelectItem value="PO">PO</SelectItem>
                                <SelectItem value="OTHERS">Others</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label className="text-xs font-medium uppercase text-muted-foreground">PO Released Date</Label>
                        <DatePicker
                            value={releasedDateFilter || undefined}
                            onChange={(value) => setReleasedDateFilter(value)}
                            placeholder="All Dates"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1.5">
                            <StoreIcon className="h-3 w-3 text-primary/70" /> Store
                        </Label>
                        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-52 justify-between h-10 px-3 bg-background border-border rounded-lg font-normal"
                                >
                                    <span className="truncate text-left text-sm">
                                        {selectedStoresLabel}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-0" align="end">
                                <Command>
                                    <CommandInput
                                        placeholder="Search store..."
                                        value={storeSearch}
                                        onValueChange={setStoreSearch}
                                    />
                                    <CommandList className="max-h-64 overflow-auto">
                                        <CommandEmpty>No store found.</CommandEmpty>
                                        <CommandGroup>
                                            {storeOptions
                                                .filter((opt) =>
                                                    storeSearch
                                                        ? opt.label.toLowerCase().includes(storeSearch.toLowerCase())
                                                        : true
                                                )
                                                .map((opt) => {
                                                    const isSelected = storeIdsFilter.includes(opt.id);
                                                    return (
                                                        <CommandItem
                                                            key={opt.id}
                                                            onSelect={() => {
                                                                if (isSelected) {
                                                                    setStoreIdsFilter(storeIdsFilter.filter((id) => id !== opt.id));
                                                                } else {
                                                                    setStoreIdsFilter([...storeIdsFilter, opt.id]);
                                                                }
                                                            }}
                                                        >
                                                            <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible'}`}>
                                                                <Check className="h-3 w-3" />
                                                            </div>
                                                            <span className="truncate text-sm">{opt.label}</span>
                                                        </CommandItem>
                                                    );
                                                })}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1.5">
                            <Tag className="h-3 w-3 text-primary/70" /> Brand
                        </Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-52 justify-between h-10 px-3 bg-background border-border rounded-lg font-normal"
                                >
                                    <span className="truncate text-left text-sm">
                                        {selectedBrandsLabel}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-0" align="end">
                                <Command>
                                    <CommandInput
                                        placeholder="Search brand..."
                                        value={brandSearch}
                                        onValueChange={setBrandSearch}
                                    />
                                    <CommandList className="max-h-64 overflow-auto">
                                        <CommandEmpty>No brand found.</CommandEmpty>
                                        <CommandGroup>
                                            {brandOptions
                                                .filter((opt) =>
                                                    brandSearch
                                                        ? opt.label.toLowerCase().includes(brandSearch.toLowerCase())
                                                        : true
                                                )
                                                .map((opt) => {
                                                    const isSelected = brandIdsFilter.includes(opt.id);
                                                    return (
                                                        <CommandItem
                                                            key={opt.id}
                                                            onSelect={() => {
                                                                if (isSelected) {
                                                                    setBrandIdsFilter(brandIdsFilter.filter((id) => id !== opt.id));
                                                                } else {
                                                                    setBrandIdsFilter([...brandIdsFilter, opt.id]);
                                                                }
                                                            }}
                                                        >
                                                            <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible'}`}>
                                                                <Check className="h-3 w-3" />
                                                            </div>
                                                            <span className="truncate text-sm">{opt.label}</span>
                                                        </CommandItem>
                                                    );
                                                })}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </div>

            {/* 1. Status Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {statusSummaries.map((summary: any) => (
                    <POStatusCard
                        key={summary.status}
                        title={`PO ${summary.status}`}
                        count={summary.count}
                        totalValue={summary.total_value}
                        skuCount={summary.sku_count}
                        totalQty={summary.total_qty}
                        avgDays={summary.avg_days}
                        diffDays={summary.diff_days}
                        isActive={statusModalOpen && summary.status === selectedStatus}
                        onClick={() => {
                            setSelectedStatus(summary.status);
                            setStatusModalOpen(true);
                        }}
                    />
                ))}
            </div>

            {/* 2. Charts Row 1: Funnel & Trend */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <POFunnelChart data={funnelData} />
                <POTrendChart data={trendData} />
            </div>


            {/* 3. Charts Row 2: Aging & Supplier Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <POAgingTable initialItems={agingData} />
                <SupplierPerformanceChart initialItems={supplierPerformanceData} />
            </div>

            {/* Find the summary for the selected status to pass totals */}
            {(() => {
                const selectedSummary = statusSummaries.find((s: any) => s.status === selectedStatus);
                return (
                    <POSnapshotDialog
                        status={selectedStatus}
                        open={statusModalOpen}
                        onOpenChange={(open: boolean) => {
                            setStatusModalOpen(open);
                            if (!open) {
                                setSelectedStatus(null);
                            }
                        }}
                        summaryDefaults={selectedSummary ? {
                            totalPOs: selectedSummary.count,
                            totalQty: selectedSummary.total_qty,
                            totalValue: selectedSummary.total_value,
                            totalSkus: selectedSummary.sku_count
                        } : undefined}
                    />
                );
            })()}
        </div>
    );
}

export default function PODashboardPage() {
    return (
        <PODashboardFilterProvider>
            <PODashboardContent />
        </PODashboardFilterProvider>
    );
}
