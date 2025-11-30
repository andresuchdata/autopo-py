"use client";

import { useState, useCallback } from 'react';
import { ConditionKey, type ChartData } from '@/services/dashboardService';
import { type StockHealthItemsResponse } from '@/services/stockHealthService';
import { useDashboard } from '@/hooks/useDashboard';
import { DashboardFilters } from './dashboard/DashboardFilters';
import { SummaryCards } from './dashboard/SummaryCards';
import { DashboardCharts } from './dashboard/DashboardCharts';
import { StockItemsDialog } from './dashboard/StockItemsDialog';
import { type SummaryGrouping } from '@/types/stockHealth';

const CONDITION_KEYS: ConditionKey[] = ['overstock', 'healthy', 'low', 'nearly_out', 'out_of_stock'];

const makeEmptyConditionRecord = (): Record<ConditionKey, number> => ({
  overstock: 0,
  healthy: 0,
  low: 0,
  nearly_out: 0,
  out_of_stock: 0,
});

const EMPTY_SUMMARY = {
  totalItems: 0,
  totalStock: 0,
  totalValue: 0,
  byCondition: makeEmptyConditionRecord(),
  stockByCondition: makeEmptyConditionRecord(),
  valueByCondition: makeEmptyConditionRecord(),
};

const EMPTY_CHARTS: ChartData = {
  conditionCounts: makeEmptyConditionRecord(),
  pieDataBySkuCount: [],
  pieDataByStock: [],
  pieDataByValue: [],
};

export function EnhancedDashboard() {
  const {
    data,
    loading,
    error,
    selectedDate,
    lastUpdated,
    filters,
    brandOptions,
    storeOptions,
    availableDates,
    onDateChange,
    onFiltersChange,
    fetchItems,
  } = useDashboard();

  const [selectedCondition, setSelectedCondition] = useState<ConditionKey | null>(null);
  const [selectedGrouping, setSelectedGrouping] = useState<SummaryGrouping | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCardClick = useCallback((condition: ConditionKey, grouping: SummaryGrouping) => {
    setSelectedCondition(condition);
    setSelectedGrouping(grouping);
    setIsDialogOpen(true);
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setSelectedCondition(null);
      setSelectedGrouping(null);
    }
  }, []);

  const fetchItemsForDialog = useCallback(
    async (params: { page: number; pageSize: number }): Promise<StockHealthItemsResponse> => {
      if (!selectedCondition) {
        return { items: [], total: 0 };
      }

      return fetchItems({
        condition: selectedCondition,
        page: params.page,
        pageSize: params.pageSize,
        grouping: selectedGrouping ?? undefined,
      });
    },
    [fetchItems, selectedCondition, selectedGrouping]
  );

  const summary = data?.summary ?? EMPTY_SUMMARY;
  const charts = data?.charts ?? EMPTY_CHARTS;
  const brandBreakdown = data?.brandBreakdown ?? [];
  const storeBreakdown = data?.storeBreakdown ?? [];

  // Show loading state if initial load and no data
  if (loading && !data) {
    return <div className="flex justify-center items-center h-96">Loading dashboard data...</div>;
  }

  if (error) {
    return <div className="text-red-500 p-4 border border-red-200 rounded bg-red-50">Error: {error}</div>;
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Stock Health Dashboard</h2>
          <p className="text-muted-foreground mt-1">Overview of inventory health across brands and stores.</p>
        </div>
        <div className="text-sm text-muted-foreground bg-gray-100 px-3 py-1 rounded-full">
          {lastUpdated && `Last updated: ${lastUpdated.toLocaleString()}`}
        </div>
      </div>

      <DashboardFilters
        filters={filters}
        onFilterChange={onFiltersChange}
        brandOptions={brandOptions}
        storeOptions={storeOptions}
        selectedDate={selectedDate}
        availableDates={availableDates}
        onDateChange={onDateChange}
      />

      <SummaryCards summary={summary} onCardClick={handleCardClick} isLoading={loading} />

      <DashboardCharts
        charts={charts}
        brandBreakdown={brandBreakdown}
        storeBreakdown={storeBreakdown}
        isLoading={loading}
      />

      <StockItemsDialog
        isOpen={isDialogOpen}
        condition={selectedCondition}
        grouping={selectedGrouping}
        onOpenChange={handleDialogOpenChange}
        fetchItems={fetchItemsForDialog}
      />
    </div>
  );
}