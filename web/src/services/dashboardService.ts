import { stockHealthService, StockHealthDashboardResponse, ConditionBreakdownResponse } from './stockHealthService';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CONDITION_KEYS = [
  'overstock',
  'healthy',
  'low',
  'nearly_out',
  'out_of_stock',
] as const;

export type ConditionKey = (typeof CONDITION_KEYS)[number];

interface CacheEntry {
  data: DashboardData;
  timestamp: number;
}

export interface DashboardFilters {
  brandIds?: number[];
  storeIds?: number[];
}

export interface DashboardData {
  summary: DashboardSummary;
  charts: ChartData;
  brandBreakdown: ConditionBreakdownResponse[];
  storeBreakdown: ConditionBreakdownResponse[];
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
    return `${date}-${brandKey}-${storeKey}`;
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
    };

    const summary = this.calculateSummary(normalizedResponse.summary);
    const charts = this.prepareChartData(summary);
    return {
      summary,
      charts,
      brandBreakdown: normalizedResponse.brand_breakdown,
      storeBreakdown: normalizedResponse.store_breakdown,
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
}

export const dashboardService = DashboardService.getInstance();