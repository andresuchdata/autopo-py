'use client';

import { useEffect, useState } from 'react';
import { Filter as FilterIcon } from 'lucide-react';
import { POStatusCard } from '@/components/dashboard/POStatusCard';
import { POFunnelChart } from '@/components/dashboard/POFunnelChart';
import { POTrendChart } from '@/components/dashboard/POTrendChart';
import { POAgingTable } from '@/components/dashboard/POAgingTable';
import { SupplierPerformanceChart } from '@/components/dashboard/SupplierPerformanceChart';
import { getDashboardSummary, type DashboardSummaryParams, poService } from '@/services/api';
import { POSnapshotDialog } from '@/components/dashboard/POSnapshotDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PODashboardFilterProvider, usePODashboardFilter } from '@/contexts/PODashboardFilterContext';
import { PODashboardFilter } from '@/components/dashboard/PODashboardFilter';

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
    const { poTypeFilter, releasedDateFilter, storeIdsFilter, brandIdsFilter, supplierIdsFilter } = usePODashboardFilter();

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
                if (supplierIdsFilter.length > 0) {
                    params.supplierIds = supplierIdsFilter;
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
    }, [poTypeFilter, releasedDateFilter, storeIdsFilter, brandIdsFilter, supplierIdsFilter]);

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
                <PODashboardFilter loading={loading} />
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
