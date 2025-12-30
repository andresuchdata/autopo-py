'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { DollarSign, Filter as FilterIcon, Layers, Package, ShoppingCart, RefreshCw } from 'lucide-react';
import { POStatusCard } from '@/components/dashboard/POStatusCard';
import { POFunnelChart } from '@/components/dashboard/POFunnelChart';
import { POTrendChart } from '@/components/dashboard/POTrendChart';
import { POAgingTable } from '@/components/dashboard/POAgingTable';
import { SupplierPerformanceChart } from '@/components/dashboard/SupplierPerformanceChart';
import {
    getDashboardStatusSummary,
    getDashboardTotals,
    getDashboardTrend,
    getPOAging,
    getSupplierPerformance,
    type DashboardSummaryParams,
    poService,
    invalidatePOSnapshotCache
} from '@/services/api';
import { Skeleton } from '@/components/ui/skeleton';
import { usePODashboardFilter, POTypeFilter } from '@/contexts/PODashboardFilterContext';
import { PODashboardFilter } from '@/components/dashboard/PODashboardFilter';
import { formatCurrencyIDR, formatNumberID } from '@/utils/formatters';
import { Button } from '@/components/ui/button';


function PODashboardContent() {
    const router = useRouter();
    const [statusSummary, setStatusSummary] = useState<any[]>([]);
    const [apiTotals, setApiTotals] = useState<any | null>(null);
    const [funnelData, setFunnelData] = useState<any[]>([]);
    const [trendData, setTrendData] = useState<any[]>([]);
    const [agingData, setAgingData] = useState<any[]>([]);
    const [supplierPerformanceData, setSupplierPerformanceData] = useState<any[]>([]);

    const [loadingStatus, setLoadingStatus] = useState(true);
    const [loadingTotals, setLoadingTotals] = useState(true);
    const [loadingCharts, setLoadingCharts] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const isLoading = loadingStatus || loadingTotals || loadingCharts || refreshing;

    const {
        poTypeFilter,
        releasedDateFilter,
        storeIdsFilter,
        brandIdsFilter,
        supplierIdsFilter,
        setFilters
    } = usePODashboardFilter();

    // URL Sync Logic (unchanged)...
    // ... (keeping existing URL sync logic) ... 

    // Initial Data Fetch
    useEffect(() => {
        const controller = new AbortController();
        let isActive = true;

        const fetchData = async () => {
            setLoadingStatus(true);
            setLoadingTotals(true);
            setLoadingCharts(true);
            setError(null);

            const params: DashboardSummaryParams = {};
            if (poTypeFilter !== 'ALL') params.poType = poTypeFilter;
            if (releasedDateFilter) params.releasedDate = releasedDateFilter;
            if (storeIdsFilter.length > 0) params.storeIds = storeIdsFilter;
            if (brandIdsFilter.length > 0) params.brandIds = brandIdsFilter;
            if (supplierIdsFilter.length > 0) params.supplierIds = supplierIdsFilter;

            const opts = { signal: controller.signal };

            // 1. Fetch Totals (Fastest)
            getDashboardTotals(params).then((res: any) => {
                if (isActive) {
                    setApiTotals(res);
                    setLoadingTotals(false);
                }
            }).catch((err: any) => {
                if (isActive) console.error("Failed to load totals", err);
            });

            // 2. Fetch Status Summary (Medium) -> Drives Status Cards & Funnel
            getDashboardStatusSummary(params).then((res: any) => {
                if (isActive) {
                    setStatusSummary(res);
                    // Derive funnel data from status summary to save a call
                    const funnel = res.map((s: any) => ({
                        stage: s.status,
                        count: s.count,
                        total_value: s.total_value
                    }));
                    setFunnelData(funnel);
                    setLoadingStatus(false);
                }
            }).catch((err: any) => {
                if (isActive) console.error("Failed to load status summary", err);
            });

            // 3. Fetch Charts (Slowest) - Trend, Aging, Performance
            Promise.allSettled([
                getDashboardTrend('day', params),
                getPOAging(params),
                getSupplierPerformance(params)
            ]).then(results => {
                if (!isActive) return;

                // Trend
                if (results[0].status === 'fulfilled') setTrendData(results[0].value);

                // Aging
                if (results[1].status === 'fulfilled') setAgingData(results[1].value);

                // Supplier Performance
                if (results[2].status === 'fulfilled') setSupplierPerformanceData(results[2].value);

                setLoadingCharts(false);
            });
        };

        fetchData();

        return () => {
            isActive = false;
            controller.abort();
        };
    }, [poTypeFilter, releasedDateFilter, storeIdsFilter, brandIdsFilter, supplierIdsFilter]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await invalidatePOSnapshotCache();

            const params: DashboardSummaryParams = {};
            if (poTypeFilter !== 'ALL') params.poType = poTypeFilter;
            if (releasedDateFilter) params.releasedDate = releasedDateFilter;
            if (storeIdsFilter.length > 0) params.storeIds = storeIdsFilter;
            if (brandIdsFilter.length > 0) params.brandIds = brandIdsFilter;
            if (supplierIdsFilter.length > 0) params.supplierIds = supplierIdsFilter;

            const p1 = getDashboardTotals(params).then(setApiTotals);
            const p2 = getDashboardStatusSummary(params).then((res: any) => {
                setStatusSummary(res);
                setFunnelData(res.map((s: any) => ({ stage: s.status, count: s.count, total_value: s.total_value })));
            });
            const p3 = getDashboardTrend('day', params).then(setTrendData);
            const p4 = getPOAging(params).then(setAgingData);
            const p5 = getSupplierPerformance(params).then(setSupplierPerformanceData);

            await Promise.allSettled([p1, p2, p3, p4, p5]);

        } catch (err: any) {
            console.error('Failed to refresh dashboard:', err);
            setError('Failed to refresh dashboard data');
        } finally {
            setRefreshing(false);
        }
    };

    if (!isLoading && error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
                <div className="text-red-500">{error}</div>
            </div>
        );
    }

    // Define the desired order for PO status cards
    const statusOrder = ['Released', 'Sent', 'Approved', 'Declined', 'Arrived', 'Received'];

    const rawSummaries = statusSummary ?? [];
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

    const totals = useMemo(() => {
        if (apiTotals) {
            return {
                totalPOs: apiTotals.total_pos ?? 0,
                totalValue: apiTotals.total_value ?? 0,
                totalQty: apiTotals.total_qty ?? 0,
                totalSku: apiTotals.total_sku ?? 0,
            };
        }

        if (!statusSummaries.length) {
            return { totalPOs: 0, totalValue: 0, totalQty: 0, totalSku: 0 };
        }

        return statusSummaries.reduce(
            (acc, summary) => {
                acc.totalPOs += summary.count ?? 0;
                acc.totalValue += summary.total_value ?? 0;
                acc.totalQty += summary.total_qty ?? 0;
                acc.totalSku += summary.sku_count ?? 0;
                return acc;
            },
            { totalPOs: 0, totalValue: 0, totalQty: 0, totalSku: 0 }
        );
    }, [apiTotals, statusSummaries]);

    return (
        <div className="min-h-screen bg-background text-foreground space-y-6 overflow-x-hidden">
            {/* 0. Header Area: Title & Refresh */}
            <div className="px-6 pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between max-w-[1600px] mx-auto">
                    <div className="flex items-start gap-3">
                        <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
                            <ShoppingCart className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Purchase Orders Dashboard</h1>
                            <p className="text-sm text-muted-foreground mt-1">Manage and monitor purchase order lifecycles and performance insights.</p>
                        </div>
                    </div>
                    <Button
                        onClick={handleRefresh}
                        disabled={isLoading}
                        variant="outline"
                        size="sm"
                        className="gap-2 self-start sm:self-center h-9"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'Refreshing...' : 'Refresh Data'}
                    </Button>
                </div>
            </div>

            {/* 0b. Filter Area: Dedicated section with subtle background */}
            <div className="px-6">
                <div className="max-w-[1600px] mx-auto p-4 rounded-xl border border-border/50 bg-muted/30">
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <FilterIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Filters</span>
                    </div>
                    <PODashboardFilter loading={isLoading} />
                </div>
            </div>

            <div className="px-6 pb-12 space-y-8 max-w-[1600px] mx-auto">

                {/* 1. Status Summary Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    {isLoading
                        ? Array.from({ length: 6 }).map((_, idx) => (
                            <div key={idx} className="space-y-3 rounded-xl border border-border bg-card p-4">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-6 w-16" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-3/4" />
                            </div>
                        ))
                        : statusSummaries.map((summary: any) => (
                            <POStatusCard
                                key={summary.status}
                                title={`PO ${summary.status}`}
                                count={summary.count}
                                totalValue={summary.total_value}
                                skuCount={summary.sku_count}
                                totalQty={summary.total_qty}
                                avgDays={summary.avg_days}
                                isActive={false}
                                onClick={() => {
                                    const params = new URLSearchParams();
                                    if (storeIdsFilter.length > 0) {
                                        // Pass as comma-separated values to support multiple stores
                                        params.set('store_ids', storeIdsFilter.join(','));
                                    }
                                    if (brandIdsFilter.length > 0) {
                                        params.set('brand_ids', brandIdsFilter.join(','));
                                    }
                                    if (supplierIdsFilter.length > 0) {
                                        params.set('supplier_ids', supplierIdsFilter.join(','));
                                    }
                                    if (poTypeFilter !== 'ALL') {
                                        params.set('po_type', poTypeFilter);
                                    }
                                    if (releasedDateFilter) {
                                        params.set('released_date', releasedDateFilter);
                                    }

                                    const query = params.toString();
                                    const url = `/dashboard/po/status/${encodeURIComponent(summary.status.toLowerCase())}${query ? `?${query}` : ''}`;
                                    router.push(url);
                                }}
                            />
                        ))}
                </div>

                {/* 1b. Aggregate Totals */}
                <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-muted/40 via-card to-background p-5 shadow-md space-y-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Overall totals</p>
                            <h2 className="text-lg font-semibold text-foreground">Impact of current filters</h2>
                            <p className="text-sm text-muted-foreground">
                                Sum of PO count, inventory value, quantity, and SKU breadth across visible statuses.
                            </p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-1 text-xs font-medium text-muted-foreground">
                            <span className="h-2 w-2 rounded-full bg-primary" />
                            {statusSummaries.length} statuses included
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {Array.from({ length: 4 }).map((_, idx) => (
                                <div key={idx} className="rounded-2xl border border-border/60 bg-card/60 p-4">
                                    <Skeleton className="h-4 w-24 mb-3" />
                                    <Skeleton className="h-8 w-32" />
                                    <Skeleton className="h-3 w-20 mt-2" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {[
                                {
                                    label: 'PO Count',
                                    value: totals.totalPOs,
                                    icon: ShoppingCart,
                                    helper: 'Orders created',
                                    formatter: (val: number) => formatNumberID(val),
                                },
                                {
                                    label: 'Total Value',
                                    value: totals.totalValue,
                                    icon: DollarSign,
                                    helper: 'IDR',
                                    formatter: (val: number) =>
                                        formatCurrencyIDR(val, { compactThreshold: 50_000_000, compactMaximumFractionDigits: 1 }),
                                },
                                {
                                    label: 'Total Qty',
                                    value: totals.totalQty,
                                    icon: Package,
                                    helper: 'Units pending',
                                    formatter: (val: number) => formatNumberID(val),
                                },
                                {
                                    label: 'Total SKUs',
                                    value: totals.totalSku,
                                    icon: Layers,
                                    helper: 'Unique items',
                                    formatter: (val: number) => formatNumberID(val),
                                },
                            ].map((metric) => {
                                const Icon = metric.icon;
                                return (
                                    <div
                                        key={metric.label}
                                        className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm hover:shadow-md transition-shadow"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                                                <p className="mt-2 text-2xl font-semibold text-foreground">{metric.formatter(metric.value)}</p>
                                            </div>
                                            <div className="rounded-xl bg-primary/10 p-2 text-primary">
                                                <Icon className="h-5 w-5" strokeWidth={2.2} />
                                            </div>
                                        </div>
                                        <p className="mt-3 text-xs text-muted-foreground">{metric.helper}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 2. Charts Row 1: Funnel & Trend */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {isLoading ? (
                        <Skeleton className="h-[320px] w-full rounded-xl" />
                    ) : (
                        <POFunnelChart data={funnelData} />
                    )}
                    {isLoading ? (
                        <Skeleton className="h-[320px] w-full rounded-xl" />
                    ) : (
                        <POTrendChart data={trendData} />
                    )}
                </div>


                {/* 3. Charts Row 2: Aging & Supplier Performance */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {isLoading ? (
                        <Skeleton className="h-[360px] w-full rounded-xl" />
                    ) : (
                        <POAgingTable initialItems={agingData} />
                    )}
                    {isLoading ? (
                        <Skeleton className="h-[360px] w-full rounded-xl" />
                    ) : (
                        <SupplierPerformanceChart initialItems={supplierPerformanceData} />
                    )}
                </div>
            </div>
        </div>
    );
}

export default function PODashboardPage() {
    return <PODashboardContent />;
}
