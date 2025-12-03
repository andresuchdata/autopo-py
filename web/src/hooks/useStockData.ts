import { useState, useCallback, useEffect } from 'react';
import {
  dashboardService,
  type DashboardData,
  type DashboardFilters,
  type ConditionKey,
} from '@/services/dashboardService';
import { stockHealthService, type StockHealthItemsResponse } from '@/services/stockHealthService';
import { type SummaryGrouping, type SortDirection, type StockItemsSortField } from '@/types/stockHealth';

export interface LabeledOption {
  id: number | null;
  name: string;
}

const MIN_DATE_OPTIONS = 30;

export function useStockData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [lastFilters, setLastFilters] = useState<DashboardFilters | undefined>(undefined);
  const [lastDate, setLastDate] = useState<string | null>(null);

  const getTodayDate = useCallback(() => new Date().toISOString().split('T')[0], []);

  const generateFallbackDates = useCallback((days: number) => {
    const today = new Date();
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - index);
      return date.toISOString().split('T')[0];
    });
  }, []);

  const ensureDateCoverage = useCallback(
    (dates: string[]): string[] => {
      if (!dates || dates.length === 0) {
        return generateFallbackDates(MIN_DATE_OPTIONS);
      }

      const uniqueDates = Array.from(new Set(dates));
      uniqueDates.sort((a, b) => {
        if (a === b) return 0;
        return a > b ? -1 : 1;
      });

      if (uniqueDates.length >= MIN_DATE_OPTIONS) {
        return uniqueDates;
      }

      const fallbackDates = generateFallbackDates(MIN_DATE_OPTIONS);
      const mergedDates = Array.from(new Set([...fallbackDates, ...uniqueDates]));
      mergedDates.sort((a, b) => {
        if (a === b) return 0;
        return a > b ? -1 : 1;
      });
      return mergedDates;
    },
    [generateFallbackDates]
  );

  useEffect(() => {
    const fetchDates = async () => {
      try {
        const { dates } = await stockHealthService.getAvailableDatesWithLatest();
        const normalizedDates = ensureDateCoverage(dates);
        setAvailableDates(normalizedDates);

        if (dates.length === 0 && normalizedDates.length > 0) {
          setLastDate((prev) => prev ?? normalizedDates[0]);
        }
      } catch (err) {
        console.error('Failed to fetch available dates:', err);
        const fallbackDates = generateFallbackDates(MIN_DATE_OPTIONS);
        setAvailableDates(fallbackDates);
        if (fallbackDates.length > 0) {
          setLastDate((prev) => prev ?? fallbackDates[0]);
        }
      }
    };
    fetchDates();
  }, [ensureDateCoverage, generateFallbackDates]);

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
      sortField?: StockItemsSortField;
      sortDirection?: SortDirection;
    }): Promise<StockHealthItemsResponse> => {
      const stockDate = params.date ?? lastDate ?? getTodayDate();
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
        skuCodes: lastFilters?.skuCodes,
        grouping: params.grouping,
        sortField: params.sortField,
        sortDirection: params.sortDirection,
      });
    },
    [getTodayDate, lastDate, lastFilters]
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
