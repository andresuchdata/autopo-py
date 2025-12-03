'use client';

import React, { useEffect, useState } from 'react';
import { POStatusCard } from '@/components/dashboard/POStatusCard';
import { POFunnelChart } from '@/components/dashboard/POFunnelChart';
import { POTrendChart } from '@/components/dashboard/POTrendChart';
import { POAgingTable } from '@/components/dashboard/POAgingTable';
import { SupplierPerformanceChart } from '@/components/dashboard/SupplierPerformanceChart';
import { getDashboardSummary } from '@/services/api';

interface DashboardData {
    status_summaries: any[];
    lifecycle_funnel: any[];
    trends: any[];
    aging: any[];
    supplier_performance: any[];
}

export default function PODashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const result = await getDashboardSummary();
                setData(result);
            } catch (err) {
                console.error(err);
                setError('Failed to load dashboard data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

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

    const statusSummaries = data.status_summaries ?? [];
    const funnelData = data.lifecycle_funnel ?? [];
    const trendData = data.trends ?? [];
    const agingData = data.aging ?? [];
    const supplierPerformanceData = data.supplier_performance ?? [];

    return (
        <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Purchase Orders Dashboard</h1>
                {/* Add date filter or other controls here if needed */}
            </div>

            {/* 1. Status Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {statusSummaries.map((summary: any) => (
                    <POStatusCard
                        key={summary.status}
                        title={`PO ${summary.status}`}
                        count={summary.count}
                        value={summary.total_value}
                        avgDays={summary.avg_days}
                        diffDays={summary.diff_days}
                        isActive={summary.status === 'Sent'} // Example active state
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
        </div>
    );
}
