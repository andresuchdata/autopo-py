"use client";

import { useState, useCallback } from 'react';
import { cn } from "@/lib/utils";
import { ConditionKey, type ChartData } from '@/services/dashboardService';
import { type StockHealthItemsResponse } from '@/services/stockHealthService';
import { useDashboard } from '@/hooks/useDashboard';
import { DashboardFilters } from './dashboard/DashboardFilters';
import { SummaryCards } from './dashboard/SummaryCards';
import { DashboardCharts } from './dashboard/DashboardCharts';
import { StockItemsDialog } from './dashboard/StockItemsDialog';
import { OverstockSubgroupCards } from './dashboard/OverstockSubgroupCards';
import { type SummaryGrouping, type SortDirection, type StockItemsSortField } from '@/types/stockHealth';
import { Package, RefreshCw, LayoutDashboard } from "lucide-react";

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
    kategoriBrandOptions,
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
  const [selectedOverstockGroup, setSelectedOverstockGroup] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCardClick = useCallback((condition: ConditionKey, grouping: SummaryGrouping) => {
    setSelectedCondition(condition);
    setSelectedGrouping(grouping);
    setIsDialogOpen(true);
  }, []);

  const handleOverstockCardClick = useCallback((category: string, grouping: SummaryGrouping) => {
    setSelectedCondition('overstock');
    setSelectedGrouping(grouping);
    setSelectedOverstockGroup(category);
    setIsDialogOpen(true);
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setSelectedCondition(null);
      setSelectedGrouping(null);
      setSelectedOverstockGroup(null);
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
        overstockGroup: selectedOverstockGroup ?? undefined,
      });
    },
    [fetchItems, selectedCondition, selectedGrouping, selectedOverstockGroup]
  );

  const summary = data?.summary ?? EMPTY_SUMMARY;
  const charts = data?.charts ?? EMPTY_CHARTS;
  const brandBreakdown = data?.brandBreakdown ?? [];
  const storeBreakdown = data?.storeBreakdown ?? [];
  const overstockBreakdown = data?.overstockBreakdown ?? EMPTY_OVERSTOCK_BREAKDOWN;

  const isInitialLoading = loading && !data;

  if (error) {
    return <div className="text-destructive p-6 border border-destructive/20 rounded-xl bg-destructive/10 max-w-2xl mx-auto mt-20 text-center font-medium">Error: {error}</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground space-y-8 p-6 lg:p-10 max-w-[1800px] mx-auto transition-colors duration-300">

      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/40 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-xl text-primary shadow-sm border border-primary/20">
            <LayoutDashboard size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Stock Health
            </h2>
            <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
              Inventory analytics and stock level monitoring
            </p>
          </div>
        </div>

        {lastUpdated && (
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-4 py-2 rounded-full border border-border/50 shadow-sm backdrop-blur-sm">
            <RefreshCw size={12} className="text-primary animate-[spin_8s_linear_infinite]" />
            <span>Updated: {lastUpdated.toLocaleString()}</span>
          </div>
        )}
      </div>

      {isInitialLoading && (
        <div className="flex w-full justify-center items-center gap-2 text-xs text-muted-foreground mb-2">
          <div className="h-3 w-3 rounded-full border-2 border-muted border-t-primary animate-spin" />
          <span>Loading inventory data...</span>
        </div>
      )}

      <div className={cn(isInitialLoading && "pointer-events-none opacity-60 select-none")}
      >
        <DashboardFilters
          filters={filters}
          onFilterChange={onFiltersChange}
          brandOptions={brandOptions}
          storeOptions={storeOptions}
          kategoriBrandOptions={kategoriBrandOptions}
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
      </div>

      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <section>
          <SummaryCards summary={summary} onCardClick={handleCardClick} isLoading={loading} />
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-1 bg-primary rounded-full" />
            <h3 className="text-xl font-semibold tracking-tight text-foreground">Overstock Deep Dive</h3>
          </div>
          <OverstockSubgroupCards breakdown={overstockBreakdown} onCardClick={handleOverstockCardClick} />
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-1 bg-secondary rounded-full" />
            <h3 className="text-xl font-semibold tracking-tight text-foreground">Category Analytics</h3>
          </div>
          <DashboardCharts
            charts={charts}
            brandBreakdown={brandBreakdown}
            storeBreakdown={storeBreakdown}
            isLoading={loading}
          />
        </section>
      </div>

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