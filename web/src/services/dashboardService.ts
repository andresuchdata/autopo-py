import { healthMonitorService, HealthMonitorData } from './healthMonitorService';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CONDITION_KEYS = [
  'overstock',
  'healthy',
  'low',
  'nearly_out',
  'out_of_stock',
] as const;

type ConditionKey = (typeof CONDITION_KEYS)[number];

interface CacheEntry {
  data: DashboardData;
  timestamp: number;
}

export interface ConditionCount {
  brand?: string;
  store?: string;
  condition: ConditionKey;
  count: number;
}

interface NormalizedHealthItem {
  sku: string;
  name: string;
  brand: string;
  store: string;
  stock: number;
  dailySales: number;
  condition: ConditionKey;
  daysOfCover: number;
  hpp: number; // Historical Purchase Price
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
  charts: {
    conditionCounts: Record<ConditionKey, number>;
    pieDataBySkuCount: { condition: ConditionKey; value: number }[];
    pieDataByStock: { condition: ConditionKey; value: number }[];
    pieDataByValue: { condition: ConditionKey; value: number }[];
  };
}

export class DashboardService {
  private static instance: DashboardService;
  private cache: Map<string, CacheEntry> = new Map();

  static getInstance(): DashboardService {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
      // Clean up expired cache entries periodically
      setInterval(() => {
        DashboardService.instance.cleanupCache();
      }, 60 * 60 * 1000); // Run cleanup every hour
    }
    return DashboardService.instance;
  }

  private cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > CACHE_TTL_MS) {
        this.cache.delete(key);
      }
    }
  }

  private getCacheKey(date: string, brand?: string, store?: string): string {
    return `${date}-${brand || 'all'}-${store || 'all'}`;
  }

  async getDashboardData(date: string, brand?: string, store?: string): Promise<DashboardData> {
    const cacheKey = this.getCacheKey(date, brand, store);
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    // Return cached data if it's still valid
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    // If cache is expired, remove it
    if (cached) {
      this.cache.delete(cacheKey);
    }

    // Fetch fresh data
    const data = await healthMonitorService.getData(date);
    let items = this.normalizeItems(data);

    // Apply filters if provided
    if (brand) {
      items = items.filter(item => item.brand === brand);
    }
    if (store) {
      items = items.filter(item => item.store === store);
    }

    const result = {
      summary: this.calculateSummary(items),
      charts: this.prepareChartData(items),
    };

    // Cache the results
    this.cache.set(cacheKey, {
      data: result,
      timestamp: now
    });

    return result;
  }

  private normalizeItems(data: HealthMonitorData): NormalizedHealthItem[] {
    if (!data?.data?.length) return [];

    return data.data.map((item) => {
      const stock = this.parseNumber(item.stock ?? item.Stock ?? item['Stok Akhir'] ?? 0);
      const dailySales = this.parseNumber(
        item.dailySales ?? item['Daily Sales'] ?? item['Rata2 Penjualan Harian'] ?? 0
      );
      const condition = this.getCondition(stock, dailySales);
      const daysOfCover = dailySales > 0 ? Math.floor(stock / dailySales) : 0;
      const hpp = this.parseNumber(item.hpp ?? item.HPP ?? item['HPP'] ?? 0);

      return {
        sku: item.sku ?? item.SKU ?? item['Kode Barang'] ?? '',
        name: item.name ?? item.Name ?? item['Nama Barang'] ?? '',
        brand: item.brand ?? item.Brand ?? item['Nama Brand'] ?? '',
        store: item.store ?? item.Store ?? item.store_name ?? item['Nama Store'] ?? '',
        stock,
        dailySales,
        condition,
        daysOfCover,
        hpp,
      };
    });
  }

  private calculateSummary(items: NormalizedHealthItem[]): DashboardData['summary'] {
    const summary: DashboardData['summary'] = {
      totalItems: items.length,
      overstock: 0,
      healthy: 0,
      low: 0,
      nearly_out: 0,
      out_of_stock: 0,
      items,
      byBrand: [],
      byStore: []
    };

    items.forEach((item) => {
      summary[item.condition] += 1;
    });

    // Add the brand and store breakdowns
    const brandMap = new Map<string, Record<ConditionKey, number>>();
    const storeMap = new Map<string, Record<ConditionKey, number>>();

    items.forEach((item) => {
      // Update brand counts
      if (!brandMap.has(item.brand)) {
        brandMap.set(item.brand, {
          overstock: 0,
          healthy: 0,
          low: 0,
          nearly_out: 0,
          out_of_stock: 0
        });
      }
      const brandCounts = brandMap.get(item.brand)!;
      brandCounts[item.condition] += 1;

      // Update store counts
      if (!storeMap.has(item.store)) {
        storeMap.set(item.store, {
          overstock: 0,
          healthy: 0,
          low: 0,
          nearly_out: 0,
          out_of_stock: 0
        });
      }
      const storeCounts = storeMap.get(item.store)!;
      storeCounts[item.condition] += 1;
    });

    // Convert maps to the expected format
    summary.byBrand = Array.from(brandMap.entries()).flatMap(([brand, counts]) =>
      (Object.entries(counts) as [ConditionKey, number][])
        .filter(([_, count]) => count > 0)
        .map(([condition, count]) => ({
          brand,
          condition,
          count
        }))
    ) as Array<Omit<ConditionCount, 'store'>>;

    summary.byStore = Array.from(storeMap.entries()).flatMap(([store, counts]) =>
      (Object.entries(counts) as [ConditionKey, number][])
        .filter(([_, count]) => count > 0)
        .map(([condition, count]) => ({
          store,
          condition,
          count
        }))
    ) as Array<Omit<ConditionCount, 'brand'>>;

    return summary;
  }

  private prepareChartData(items: NormalizedHealthItem[]) {
    // Initialize data structures for all conditions
    const conditionCounts = CONDITION_KEYS.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {} as Record<ConditionKey, number>);

    const stockByCondition = CONDITION_KEYS.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {} as Record<ConditionKey, number>);

    const valueByCondition = CONDITION_KEYS.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {} as Record<ConditionKey, number>);

    // Calculate metrics for each item
    items.forEach((item) => {
      conditionCounts[item.condition] += 1;
      stockByCondition[item.condition] += item.stock;
      valueByCondition[item.condition] += item.stock * item.hpp;
    });

    // Create chart data
    return {
      conditionCounts,
      pieDataBySkuCount: CONDITION_KEYS.map((condition) => ({
        condition,
        value: conditionCounts[condition],
      })),
      pieDataByStock: CONDITION_KEYS.map((condition) => ({
        condition,
        value: stockByCondition[condition],
      })),
      pieDataByValue: CONDITION_KEYS.map((condition) => ({
        condition,
        value: valueByCondition[condition],
      })),
    };
  }

  private parseNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    const sanitized = String(value).replace(/,/g, '').trim();
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private getCondition(stock: number, dailySales: number): ConditionKey {
    const daysOfCover = stock / dailySales;

    if (daysOfCover > 30) return 'overstock';
    if (daysOfCover > 15) return 'healthy';
    if (daysOfCover > 7) return 'low';
    if (daysOfCover > 0) return 'nearly_out';
    return 'out_of_stock';
  }
}

export const dashboardService = DashboardService.getInstance();