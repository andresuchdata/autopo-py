import { useState, useCallback, useEffect } from 'react';
import {
  dashboardService,
  type DashboardData,
  type DashboardFilters,
  type ConditionKey,
} from '@/services/dashboardService';
import { stockHealthService, type StockHealthItemsResponse } from '@/services/stockHealthService';
import { type SummaryGrouping } from '@/types/stockHealth';

export interface LabeledOption {
  id: number | null;
  name: string;
}

export function useStockData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [lastFilters, setLastFilters] = useState<DashboardFilters | undefined>(undefined);
  const [lastDate, setLastDate] = useState<string | null>(null);

  useEffect(() => {
    const fetchDates = async () => {
      try {
        const { dates } = await stockHealthService.getAvailableDatesWithLatest();
        setAvailableDates(dates);
      } catch (err) {
        console.error('Failed to fetch available dates:', err);
      }
    };
    fetchDates();
  }, []);

  const refresh = useCallback(async (date: string, filters?: DashboardFilters) => {
    setLoading(true);
    setError(null);

    try {
      const result = await dashboardService.getDashboardData(date, filters);

      if (!result) {
        throw new Error('Invalid or no data!');
      }

      setData(result);
      setLastUpdated(new Date());
      setLastFilters(filters);
      setLastDate(date);
      return result;
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchItems = useCallback(
    async (params: {
      date?: string;
      condition?: ConditionKey;
      page?: number;
      pageSize?: number;
      grouping?: SummaryGrouping;
    }): Promise<StockHealthItemsResponse> => {
      const stockDate = params.date ?? lastDate;
      if (!stockDate) {
        throw new Error('No stock date selected');
      }

      return stockHealthService.getItems({
        stockDate,
        condition: params.condition,
        page: params.page,
        pageSize: params.pageSize,
        brandIds: lastFilters?.brandIds,
        storeIds: lastFilters?.storeIds,
        grouping: params.grouping,
      });
    },
    [lastDate, lastFilters]
  );

  const buildOptions = useCallback(
    (type: 'brand' | 'store'): LabeledOption[] => {
      if (!data) return [];
      const seen = new Map<string, number | null>();
      const source = type === 'brand' ? data.brandBreakdown : data.storeBreakdown;

      source.forEach((entry) => {
        const name =
          type === 'brand'
            ? entry.brand || 'Unknown'
            : entry.store || 'Unknown';
        const id = type === 'brand' ? entry.brand_id ?? null : entry.store_id ?? null;
        if (!seen.has(name)) {
          seen.set(name, id);
        }
      });

      return Array.from(seen.entries()).map(([name, id]) => ({ name, id }));
    },
    [data]
  );

  const getBrandOptions = useCallback(() => buildOptions('brand'), [buildOptions]);
  const getStoreOptions = useCallback(() => buildOptions('store'), [buildOptions]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh,
    availableDates,
    fetchItems,
    getBrandOptions,
    getStoreOptions,
  };
}
