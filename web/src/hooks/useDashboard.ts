import { useState, useEffect } from 'react';
import { useStockData } from './useStockData';
import { healthMonitorService } from '@/services/healthMonitorService';

export function useDashboard() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { data, loading, error, refresh, lastUpdated } = useStockData();

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

  return {
    data,
    loading,
    error,
    selectedDate,
    lastUpdated,
    onDateChange: handleDateChange,
    refresh: () => selectedDate && refresh(selectedDate),
  };
}
