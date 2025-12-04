"use client";

import { useState, useCallback } from 'react';
import { ConditionKey, type ChartData } from '@/services/dashboardService';
import { type StockHealthItemsResponse } from '@/services/stockHealthService';
import { useDashboard } from '@/hooks/useDashboard';
import { DashboardFilters } from './dashboard/DashboardFilters';
import { SummaryCards } from './dashboard/SummaryCards';
import { DashboardCharts } from './dashboard/DashboardCharts';
import { StockItemsDialog } from './dashboard/StockItemsDialog';
import { OverstockSubgroupCards } from './dashboard/OverstockSubgroupCards';
import { type SummaryGrouping, type SortDirection, type StockItemsSortField } from '@/types/stockHealth';

const CONDITION_KEYS: ConditionKey[] = ['overstock', 'healthy', 'low', 'nearly_out', 'out_of_stock', 'no_sales', 'negative_stock'];
const OVERSTOCK_CATEGORIES = ['ringan', 'sedang', 'berat'] as const;
type OverstockCategory = (typeof OVERSTOCK_CATEGORIES)[number];

const makeEmptyConditionRecord = (): Record<ConditionKey, number> => ({
  overstock: 0,
  healthy: 0,
  low: 0,
  nearly_out: 0,
  out_of_stock: 0,
  no_sales: 0,
  negative_stock: 0,
});

const makeEmptyOverstockRecord = (): Record<OverstockCategory, number> => ({
  ringan: 0,
  sedang: 0,
  berat: 0,
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

const EMPTY_OVERSTOCK_BREAKDOWN = {
  byCategory: makeEmptyOverstockRecord(),
  stockByCategory: makeEmptyOverstockRecord(),
  valueByCategory: makeEmptyOverstockRecord(),
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
    skuOptions,
    onSkuSearch,
    skuSearchLoading,
    onSkuLoadMore,
    skuHasMoreOptions,
    skuLoadMoreLoading,
    resolveSkuOption,
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
    async (params: {
      page: number;
      pageSize: number;
      grouping?: SummaryGrouping;
      sortField?: StockItemsSortField;
      sortDirection?: SortDirection;
    }): Promise<StockHealthItemsResponse> => {
      if (!selectedCondition) {
        return { items: [], total: 0 };
      }

      return fetchItems({
        condition: selectedCondition,
        page: params.page,
        pageSize: params.pageSize,
        grouping: params.grouping ?? selectedGrouping ?? undefined,
        sortField: params.sortField,
        sortDirection: params.sortDirection,
      });
    },
    [fetchItems, selectedCondition, selectedGrouping]
  );

  const summary = data?.summary ?? EMPTY_SUMMARY;
  const charts = data?.charts ?? EMPTY_CHARTS;
  const brandBreakdown = data?.brandBreakdown ?? [];
  const storeBreakdown = data?.storeBreakdown ?? [];
  const overstockBreakdown = data?.overstockBreakdown ?? EMPTY_OVERSTOCK_BREAKDOWN;

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
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Stock Health Dashboard</h2>
          <p className="text-muted-foreground dark:text-gray-400 mt-1">Overview of inventory health across brands and stores.</p>
        </div>
        <div className="text-sm text-muted-foreground bg-gray-100 dark:bg-gray-800 dark:text-gray-300 px-3 py-1 rounded-full border dark:border-gray-700">
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
        skuOptions={skuOptions}
        onSkuSearch={onSkuSearch}
        skuSearchLoading={skuSearchLoading}
        onSkuLoadMore={onSkuLoadMore}
        skuHasMoreOptions={skuHasMoreOptions}
        skuLoadMoreLoading={skuLoadMoreLoading}
        resolveSkuOption={resolveSkuOption}
      />

      <SummaryCards summary={summary} onCardClick={handleCardClick} isLoading={loading} />

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Overstock Subgroups</h3>
        <OverstockSubgroupCards breakdown={overstockBreakdown} />
      </div>

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