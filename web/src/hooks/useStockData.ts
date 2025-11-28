import { useState, useCallback, useMemo } from 'react';
import { dashboardService, NormalizedHealthItem, ConditionKey, ConditionCount } from '@/services/dashboardService';

interface FilteredData {
  byBrand: Map<string, NormalizedHealthItem[]>;
  byStore: Map<string, NormalizedHealthItem[]>;
  byBrandAndStore: Map<string, Map<string, NormalizedHealthItem[]>>;
}

export interface DashboardData {
  summary: {
    totalItems: number;
    overstock: number;
    healthy: number;
    low: number;
    nearly_out: number;
    out_of_stock: number;
    items: NormalizedHealthItem[];
    byBrand: Array<Omit<ConditionCount, 'store'>>;
    byStore: Array<Omit<ConditionCount, 'brand'>>;
  };
  charts: any;
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
      console.log("useStockData", result);

      if(!result) {
        throw Error("Invalid or no data!")
      }

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

  interface FilteredSummary {
    items: NormalizedHealthItem[];
    byBrand: Map<string, NormalizedHealthItem[]>;
    byStore: Map<string, NormalizedHealthItem[]>;
    summary: {
      total: number;
      byCondition: Record<ConditionKey, number>;
    };
  }

// Get filtered summary based on brand and store filters
const getFilteredSummary = useCallback((brand?: string, store?: string): FilteredSummary | null => {
  if (!data) return null;
  
  // Start with all items
  let filteredItems = [...data.summary.items];
  
  // Apply filters if provided
  if (brand) {
    filteredItems = filteredItems.filter(item => item.brand === brand);
  }
  
  if (store) {
    filteredItems = filteredItems.filter(item => item.store === store);
  }
  
  // Group by brand
  const byBrand = new Map<string, NormalizedHealthItem[]>();
  // Group by store
  const byStore = new Map<string, NormalizedHealthItem[]>();
  
  // Count by condition
  const byCondition = {
    overstock: 0,
    healthy: 0,
    low: 0,
    nearly_out: 0,
    out_of_stock: 0
  } as Record<ConditionKey, number>;
  
  // Process all items once to build our data structures
  filteredItems.forEach(item => {
    // Group by brand
    if (!byBrand.has(item.brand)) {
      byBrand.set(item.brand, []);
    }
    byBrand.get(item.brand)?.push(item);
    
    // Group by store
    if (!byStore.has(item.store)) {
      byStore.set(item.store, []);
    }
    byStore.get(item.store)?.push(item);
    
    // Count by condition
    byCondition[item.condition] = (byCondition[item.condition] || 0) + 1;
  });
  
  return {
    items: filteredItems,
    byBrand,
    byStore,
    summary: {
      total: filteredItems.length,
      byCondition
    }
  };
}, [data]);

  // Get unique brands from data
  const getBrands = useCallback(() => {
    if (!data) return [];
    const brands = new Set<string>();
    data.summary.items.forEach(item => brands.add(item.brand));
    return Array.from(brands);
  }, [data]);

  // Get unique stores from data
  const getStores = useCallback(() => {
    if (!data) return [];
    const stores = new Set<string>();
    data.summary.items.forEach(item => stores.add(item.store));
    return Array.from(stores);
  }, [data]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh,
    getFilteredSummary,
    getBrands,
    getStores
  };
}
