// In useDashboard.ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStockData } from './useStockData';
import { healthMonitorService } from '@/services/healthMonitorService';

export function useDashboard() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filters, setFilters] = useState<{brand?: string; store?: string}>({});
  const { 
    data, 
    loading, 
    error, 
    refresh, 
    lastUpdated, 
    getFilteredSummary,
    getBrands,
    getStores
  } = useStockData();

  // Load the latest data on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const latestDate = await healthMonitorService.getLatestDate();
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
    onDateChange: handleDateChange,
    setFilters,
    refresh: () => selectedDate && refresh(selectedDate),
  };
}