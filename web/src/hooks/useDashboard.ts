// In useDashboard.ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStockData } from './useStockData';
import { healthMonitorService } from '@/services/healthMonitorService';

export function useDashboard() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ brand: string[]; store: string[] }>({ brand: [], store: [] });
  const {
    data,
    loading,
    error,
    refresh,
    lastUpdated,
    getFilteredSummary,
    getBrands,
    getStores,
    availableDates
  } = useStockData();

  // Load the latest data on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Get both available dates and latest date in a single call
        const { latestDate } = await healthMonitorService.getAvailableDatesWithLatest();
        if (latestDate) {
          setSelectedDate(latestDate);
          await refresh(latestDate);
        }
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    };

    loadInitialData();
  }, [refresh]);

  // Handle date change
  const handleDateChange = async (newDate: string) => {
    setSelectedDate(newDate);
    await refresh(newDate);
  };

  // Get filtered data based on current filters
  const filteredData = useMemo(() => {
    if (!data) return null;
    return getFilteredSummary(filters.brand, filters.store);
  }, [data, filters.brand, filters.store, getFilteredSummary]);

  // Get available brands and stores
  const brands = getBrands();
  const stores = getStores();

  return {
    data,
    filteredData,
    loading,
    error,
    selectedDate,
    lastUpdated,
    filters,
    brands,
    stores,
    availableDates,
    onDateChange: handleDateChange,
    setFilters,
    refresh: () => selectedDate && refresh(selectedDate),
  };
}