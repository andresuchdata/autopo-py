'use client';

import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Filter as FilterIcon, Layers, Package, ShoppingCart, RefreshCw } from 'lucide-react';
import { POStatusCard } from '@/components/dashboard/POStatusCard';
import { POFunnelChart } from '@/components/dashboard/POFunnelChart';
import { POTrendChart } from '@/components/dashboard/POTrendChart';
import { POAgingTable } from '@/components/dashboard/POAgingTable';
import { SupplierPerformanceChart } from '@/components/dashboard/SupplierPerformanceChart';
import { getDashboardSummary, type DashboardSummaryParams, poService, invalidatePOSnapshotCache } from '@/services/api';
import { POSnapshotDialog } from '@/components/dashboard/POSnapshotDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PODashboardFilterProvider, usePODashboardFilter } from '@/contexts/PODashboardFilterContext';
import { PODashboardFilter } from '@/components/dashboard/PODashboardFilter';
import { formatCurrencyIDR, formatNumberID } from '@/utils/formatters';
import { Button } from '@/components/ui/button';

interface DashboardData {
    status_summaries: any[];
    totals?: {
        total_pos: number;
        total_sku: number;
        total_qty: number;
        total_value: number;
    };
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
    const [refreshing, setRefreshing] = useState(false);
    const { poTypeFilter, releasedDateFilter, storeIdsFilter, brandIdsFilter, supplierIdsFilter } = usePODashboardFilter();

    useEffect(() => {
        const controller = new AbortController();
        let isActive = true;

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
                if (supplierIdsFilter.length > 0) {
                    params.supplierIds = supplierIdsFilter;
                }
                const result = await getDashboardSummary(params, { signal: controller.signal });
                if (!isActive) return;
                setData(result);
            } catch (err) {
                if (controller.signal.aborted) {
                    return;
                }
                // Ignore abort errors (they're expected when filters change quickly)
                if (err instanceof Error && err.name === 'CanceledError') {
                    return;
                }
                console.error(err);
                setError('Failed to load dashboard data');
            } finally {
                if (isActive) {
                    setLoading(false);
                }
            }
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
            if (supplierIdsFilter.length > 0) {
                params.supplierIds = supplierIdsFilter;
            }
            const result = await getDashboardSummary(params);
            setData(result);
        } catch (err) {
            console.error('Failed to refresh dashboard:', err);
            setError('Failed to refresh dashboard data');
        } finally {
            setRefreshing(false);
        }
    };

    if (!loading && (error || !data)) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
                <div className="text-red-500">{error || 'No data available'}</div>
            </div>
        );
    }

    // Define the desired order for PO status cards
    const statusOrder = ['Released', 'Sent', 'Approved', 'Declined', 'Arrived', 'Received'];

    const rawSummaries = data?.status_summaries ?? [];
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

    const funnelData = data?.lifecycle_funnel ?? [];
    const trendData = data?.trends ?? [];
    const agingData = data?.aging ?? [];
    const supplierPerformanceData = data?.supplier_performance ?? [];

    const totals = useMemo(() => {
        if (data?.totals) {
            return {
                totalPOs: data.totals.total_pos ?? 0,
                totalValue: data.totals.total_value ?? 0,
                totalQty: data.totals.total_qty ?? 0,
                totalSku: data.totals.total_sku ?? 0,
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
    }, [data?.totals, statusSummaries]);

    return (
        <div className="min-h-screen bg-background text-foreground p-6 space-y-6 overflow-x-hidden">
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
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end lg:justify-end w-full lg:w-auto">
                    <Button
                        onClick={handleRefresh}
                        disabled={loading || refreshing}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'Refreshing...' : 'Refresh Data'}
                    </Button>
                    <PODashboardFilter loading={loading} />
                </div>
                </div>

            {/* 1. Status Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {loading
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
                              isActive={statusModalOpen && summary.status === selectedStatus}
                              onClick={() => {
                                  setSelectedStatus(summary.status);
                                  setStatusModalOpen(true);
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

                {loading ? (
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
                {loading ? (
                    <Skeleton className="h-[320px] w-full rounded-xl" />
                ) : (
                    <POFunnelChart data={funnelData} />
                )}
                {loading ? (
                    <Skeleton className="h-[320px] w-full rounded-xl" />
                ) : (
                    <POTrendChart data={trendData} />
                )}
            </div>


            {/* 3. Charts Row 2: Aging & Supplier Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {loading ? (
                    <Skeleton className="h-[360px] w-full rounded-xl" />
                ) : (
                    <POAgingTable initialItems={agingData} />
                )}
                {loading ? (
                    <Skeleton className="h-[360px] w-full rounded-xl" />
                ) : (
                    <SupplierPerformanceChart initialItems={supplierPerformanceData} />
                )}
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
