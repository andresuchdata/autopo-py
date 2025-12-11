import { stockHealthService, StockHealthDashboardResponse, ConditionBreakdownResponse } from './stockHealthService';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CONDITION_KEYS = [
  'overstock',
  'healthy',
  'low',
  'nearly_out',
  'out_of_stock',
  'no_sales',
  'negative_stock',
] as const;

const OVERSTOCK_CATEGORIES = ['ringan', 'sedang', 'berat'] as const;

export type ConditionKey = (typeof CONDITION_KEYS)[number];
export type OverstockCategory = (typeof OVERSTOCK_CATEGORIES)[number];

interface CacheEntry {
  data: DashboardData;
  timestamp: number;
}

export interface DashboardOverstockSummary {
  byCategory: Record<OverstockCategory, number>;
  stockByCategory: Record<OverstockCategory, number>;
  valueByCategory: Record<OverstockCategory, number>;
}

export interface DashboardFilters {
  brandIds?: number[];
  storeIds?: number[];
  skuCodes?: string[];
  kategoriBrands?: string[];
}

export interface DashboardData {
  summary: DashboardSummary;
  charts: ChartData;
  brandBreakdown: ConditionBreakdownResponse[];
  storeBreakdown: ConditionBreakdownResponse[];
  overstockBreakdown: DashboardOverstockSummary;
}

export interface DashboardSummary {
  totalItems: number;
  totalStock: number;
  totalValue: number;
  byCondition: Record<ConditionKey, number>;
  stockByCondition: Record<ConditionKey, number>;
  valueByCondition: Record<ConditionKey, number>;
}

export interface ChartData {
  conditionCounts: Record<ConditionKey, number>;
  pieDataBySkuCount: { condition: ConditionKey; value: number }[];
  pieDataByStock: { condition: ConditionKey; value: number }[];
  pieDataByValue: { condition: ConditionKey; value: number }[];
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

  private getCacheKey(date: string, filters?: DashboardFilters): string {
    const brandKey = filters?.brandIds?.join('-') || 'all';
    const storeKey = filters?.storeIds?.join('-') || 'all';
    const skuKey = filters?.skuCodes?.join('-') || 'all';
    const kategoriKey = filters?.kategoriBrands?.join('-') || 'all';

    return `${date}-${brandKey}-${storeKey}-${skuKey}-${kategoriKey}`;
  }

  async getDashboardData(date: string, filters?: DashboardFilters): Promise<DashboardData> {
    const cacheKey = this.getCacheKey(date, filters);
    const cachedData = this.cache.get(cacheKey);

    if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL_MS) {
      return cachedData.data;
    }

    try {
      const response = await stockHealthService.getDashboard({
        stockDate: date,
        brandIds: filters?.brandIds,
        storeIds: filters?.storeIds,
        skuCodes: filters?.skuCodes,
        kategoriBrands: filters?.kategoriBrands,
      });

      const transformed = this.transformDashboardResponse(response);
      this.cache.set(cacheKey, { data: transformed, timestamp: Date.now() });
      return transformed;
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw error;
    }
  }

  async getAvailableDates(): Promise<string[]> {
    return stockHealthService.getAvailableDates();
  }

  private transformDashboardResponse(response: StockHealthDashboardResponse): DashboardData {
    const normalizedResponse: StockHealthDashboardResponse = {
      summary: Array.isArray(response.summary) ? response.summary : [],
      time_series: response.time_series ?? {},
      brand_breakdown: Array.isArray(response.brand_breakdown) ? response.brand_breakdown : [],
      store_breakdown: Array.isArray(response.store_breakdown) ? response.store_breakdown : [],
      overstock_breakdown: Array.isArray(response.overstock_breakdown) ? response.overstock_breakdown : [],
    };

    const summary = this.calculateSummary(normalizedResponse.summary);
    const charts = this.prepareChartData(summary);
    const overstockBreakdown = this.calculateOverstockSummary(
      normalizedResponse.overstock_breakdown
    );
    return {
      summary,
      charts,
      brandBreakdown: normalizedResponse.brand_breakdown,
      storeBreakdown: normalizedResponse.store_breakdown,
      overstockBreakdown,
    };
  }

  private calculateSummary(summaryRows: StockHealthDashboardResponse['summary']): DashboardSummary {
    const baseRecord = () => CONDITION_KEYS.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {} as Record<ConditionKey, number>);

    const byCondition = baseRecord();
    const stockByCondition = baseRecord();
    const valueByCondition = baseRecord();

    let totalItems = 0;
    let totalStock = 0;
    let totalValue = 0;

    summaryRows.forEach((row) => {
      const condition = (row.condition as ConditionKey) ?? 'out_of_stock';
      byCondition[condition] = row.count;
      stockByCondition[condition] = Number(row.total_stock ?? 0);
      valueByCondition[condition] = Number(row.total_value ?? 0);

      totalItems += row.count;
      totalStock += Number(row.total_stock ?? 0);
      totalValue += Number(row.total_value ?? 0);
    });

    return {
      totalItems,
      totalStock,
      totalValue,
      byCondition,
      stockByCondition,
      valueByCondition,
    };
  }

  private prepareChartData(summary: DashboardSummary): ChartData {
    return {
      conditionCounts: summary.byCondition,
      pieDataBySkuCount: CONDITION_KEYS.map((condition) => ({
        condition,
        value: summary.byCondition[condition],
      })),
      pieDataByStock: CONDITION_KEYS.map((condition) => ({
        condition,
        value: summary.stockByCondition[condition],
      })),
      pieDataByValue: CONDITION_KEYS.map((condition) => ({
        condition,
        value: summary.valueByCondition[condition],
      })),
    };
  }

  private calculateOverstockSummary(
    breakdown: StockHealthDashboardResponse['overstock_breakdown'] | any[]
  ): DashboardOverstockSummary {
    const initRecord = () =>
      OVERSTOCK_CATEGORIES.reduce((acc, category) => {
        acc[category] = 0;
        return acc;
      }, {} as Record<OverstockCategory, number>);

    const byCategory = initRecord();
    const stockByCategory = initRecord();
    const valueByCategory = initRecord();

    breakdown.forEach((entry: any) => {
      const category = (entry?.category ?? '').toLowerCase();
      if (!OVERSTOCK_CATEGORIES.includes(category as OverstockCategory)) {
        return;
      }
      byCategory[category as OverstockCategory] = entry.count ?? 0;
      stockByCategory[category as OverstockCategory] = Number(entry.total_stock ?? 0);
      valueByCategory[category as OverstockCategory] = Number(entry.total_value ?? 0);
    });

    return {
      byCategory,
      stockByCategory,
      valueByCategory,
    };
  }
}

export const dashboardService = DashboardService.getInstance();