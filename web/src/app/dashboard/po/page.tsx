'use client';

import React, { useEffect, useState } from 'react';
import { POStatusCard } from '@/components/dashboard/POStatusCard';
import { POFunnelChart } from '@/components/dashboard/POFunnelChart';
import { POTrendChart } from '@/components/dashboard/POTrendChart';
import { POAgingTable } from '@/components/dashboard/POAgingTable';
import { SupplierPerformanceChart } from '@/components/dashboard/SupplierPerformanceChart';
import { getDashboardSummary, type DashboardSummaryParams } from '@/services/api';
import { POSnapshotDialog } from '@/components/dashboard/POSnapshotDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
    const { poTypeFilter, setPOTypeFilter, releasedDateFilter, setReleasedDateFilter } = usePODashboardFilter();

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
    }, [poTypeFilter, releasedDateFilter]);

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
    const statusOrder = ['Released', 'Sent', 'Approved', 'Declined', 'Arrived'];

    // Sort status summaries according to the defined order
    const statusSummaries = (data.status_summaries ?? []).sort((a: any, b: any) => {
        const indexA = statusOrder.indexOf(a.status);
        const indexB = statusOrder.indexOf(b.status);
        // If status not found in order array, put it at the end
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    const funnelData = data.lifecycle_funnel ?? [];
    const trendData = data.trends ?? [];
    const agingData = data.aging ?? [];
    const supplierPerformanceData = data.supplier_performance ?? [];

    return (
        <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Purchase Orders Dashboard</h1>
                    <p className="text-sm text-muted-foreground">Filter by PO type prefix and released date to focus the insights.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium uppercase text-muted-foreground">PO Type</label>
                        <Select value={poTypeFilter} onValueChange={(value: 'ALL' | 'AU' | 'PO' | 'OTHERS') => setPOTypeFilter(value)}>
                            <SelectTrigger className="w-40">
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
                        <label className="text-xs font-medium uppercase text-muted-foreground">PO Released Date</label>
                        <Input
                            type="date"
                            value={releasedDateFilter}
                            onChange={(event) => setReleasedDateFilter(event.target.value)}
                            className="w-44"
                        />
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
                <POAgingTable data={agingData} />
                <SupplierPerformanceChart data={supplierPerformanceData} />
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
