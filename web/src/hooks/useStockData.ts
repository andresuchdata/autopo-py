import { useState, useCallback } from 'react';
import { dashboardService } from '@/services/dashboardService';

export interface DashboardData {
  summary: {
    totalItems: number;
    // Add more summary metrics as needed
  };
  charts: any; // Replace with your chart data type
}

export function useStockData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await dashboardService.getDashboardData(date);
      setData(result);
      setLastUpdated(new Date());
      return result;
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}
