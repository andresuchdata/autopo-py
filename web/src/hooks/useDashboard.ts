// In useDashboard.ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStockData } from './useStockData';
import { stockHealthService } from '@/services/stockHealthService';

export interface DashboardFiltersState {
  brandIds: number[];
  storeIds: number[];
}

const DEFAULT_FILTERS: DashboardFiltersState = { brandIds: [], storeIds: [] };

export function useDashboard() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filters, setFilters] = useState<DashboardFiltersState>(DEFAULT_FILTERS);
  const {
    data,
    loading,
    error,
    refresh,
    lastUpdated,
    availableDates,
    fetchItems,
    getBrandOptions,
    getStoreOptions,
  } = useStockData();

  const brandOptions = useMemo(() => getBrandOptions(), [getBrandOptions]);
  const storeOptions = useMemo(() => getStoreOptions(), [getStoreOptions]);

  const loadInitialData = useCallback(async () => {
    try {
      const { latestDate } = await stockHealthService.getAvailableDatesWithLatest();
      if (latestDate) {
        setSelectedDate(latestDate);
        await refresh(latestDate, filters);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  }, [filters, refresh]);

  useEffect(() => {
    if (!selectedDate) {
      loadInitialData();
    }
  }, [selectedDate, loadInitialData]);

  const handleDateChange = useCallback(async (newDate: string) => {
    setSelectedDate(newDate);
    await refresh(newDate, filters);
  }, [filters, refresh]);

  const handleFilterChange = useCallback(async (nextFilters: DashboardFiltersState) => {
    setFilters(nextFilters);
    if (selectedDate) {
      await refresh(selectedDate, nextFilters);
    }
  }, [refresh, selectedDate]);

  const refreshSelected = useCallback(() => {
    if (!selectedDate) return Promise.resolve(null);
    return refresh(selectedDate, filters);
  }, [filters, refresh, selectedDate]);

  return {
    data,
    loading,
    error,
    selectedDate,
    lastUpdated,
    filters,
    brandOptions,
    storeOptions,
    availableDates,
    onDateChange: handleDateChange,
    onFiltersChange: handleFilterChange,
    refresh: refreshSelected,
    fetchItems,
    brandList: brandOptions,
    storeList: storeOptions,
  };
}