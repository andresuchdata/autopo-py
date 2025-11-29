"use client";

import { useState } from 'react';
import { ConditionKey } from '@/services/dashboardService';
import { useDashboard } from "@/hooks/useDashboard";
import { DashboardFilters } from './dashboard/DashboardFilters';
import { SummaryCards, COLORS } from './dashboard/SummaryCards';
import { DashboardCharts } from './dashboard/DashboardCharts';
import { StockItemsDialog } from './dashboard/StockItemsDialog';

interface StockItem {
  id: number;
  store_name: string;
  sku_code: string;
  sku_name: string;
  brand_name: string;
  current_stock: number;
  days_of_cover: number;
  condition: ConditionKey;
}

export function EnhancedDashboard() {
  const {
    data,
    filteredData,
    loading,
    error,
    selectedDate,
    lastUpdated,
    onDateChange,
    brands,
    stores,
    availableDates,
  } = useDashboard();

  const [filters, setFilters] = useState<{ brand: string[]; store: string[] }>({
    brand: [],
    store: [],
  });
  const [isFiltering, setIsFiltering] = useState(false);
  const [filterTimeout, setFilterTimeout] = useState<NodeJS.Timeout | null>(null);

  const [selectedCondition, setSelectedCondition] = useState<ConditionKey | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  // Handle filter changes with debounce
  const handleFilterChange = (newFilters: { brand: string[]; store: string[] }) => {
    setIsFiltering(true);

    if (filterTimeout) {
      clearTimeout(filterTimeout);
    }

    const timeout = setTimeout(() => {
      setFilters(newFilters);
      setIsFiltering(false);
    }, 500);

    setFilterTimeout(timeout);
  };

  // Handle card click to show items for a specific condition
  const handleCardClick = async (condition: ConditionKey) => {
    setSelectedCondition(condition);
    setIsLoadingItems(true);
    try {
      if (!filteredData) return;

      // Get filtered items for the selected condition
      const items = filteredData.items
        .filter(item => item.condition === condition)
        .map((item, index) => ({
          id: index,
          store_name: item.store,
          sku_code: item.sku,
          sku_name: item.name,
          brand_name: item.brand,
          current_stock: item.stock,
          days_of_cover: item.daysOfCover,
          condition: item.condition,
        }));

      setStockItems(items);
      setIsDialogOpen(true);
    } catch (err) {
      console.error('Error loading items:', err);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Show loading state if initial load and no data
  if (loading && !data && !filteredData) {
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
          {lastUpdated && `Last updated: ${new Date(lastUpdated).toLocaleString()}`}
        </div>
      </div>

      <DashboardFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        brands={brands}
        stores={stores}
        selectedDate={selectedDate}
        availableDates={availableDates}
        onDateChange={onDateChange}
      />

      {(filteredData || loading || isFiltering) && (
        <>
          {(filteredData || isFiltering) && (
            <SummaryCards
              summary={filteredData?.summary || { total: 0, byCondition: {} as any }}
              onCardClick={handleCardClick}
              isLoading={loading || isFiltering}
            />
          )}

          <DashboardCharts
            charts={filteredData?.charts || { pieDataBySkuCount: [], pieDataByStock: [], pieDataByValue: [] }}
            byBrand={filteredData?.byBrand}
            byStore={filteredData?.byStore}
            isLoading={loading || isFiltering}
          />
        </>
      )}

      <StockItemsDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        items={stockItems}
        condition={selectedCondition}
        isLoading={isLoadingItems}
      />
    </div>
  );
}