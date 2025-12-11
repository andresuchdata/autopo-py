import { api } from '@/services/api';
import { type SummaryGrouping, type SortDirection, type StockItemsSortField } from '@/types/stockHealth';

const ANALYTICS_BASE = '/analytics/stock_health';

export interface StockHealthApiItem {
  id: number;
  store_id: number;
  store_name: string;
  sku_id: string;
  sku_code: string;
  product_name: string;
  brand_id: number;
  brand_name: string;
  current_stock: number;
  daily_stock_cover: number;
  stock_date: string;
  last_updated: string;
  stock_condition: string;
  hpp?: number;
  daily_sales: number;
}

export interface StockHealthItemsResponse {
  items: StockHealthApiItem[];
  total: number;
}

interface AvailableDatesResponse {
  dates: string[];
}

interface StockHealthSummaryResponse {
  summary: StockHealthSummary[];
}

interface StockHealthSummary {
  condition: string;
  count: number;
  total_stock: number;
  total_value: number;
}

export interface TimeSeriesResponse {
  [condition: string]: Array<{ date: string; count: number }>;
}

export interface ConditionBreakdownResponse {
  brand_id?: number;
  brand?: string;
  store_id?: number;
  store?: string;
  condition: string;
  count: number;
  total_stock: number;
  total_value: number;
}

export interface StockHealthDashboardResponse {
  summary: StockHealthSummary[];
  time_series: TimeSeriesResponse;
  brand_breakdown: ConditionBreakdownResponse[];
  store_breakdown: ConditionBreakdownResponse[];
  overstock_breakdown: {
    category: string;
    count: number;
    total_stock: number;
    total_value: number;
  }[];
}

export interface StockHealthFilterParams {
  stockDate: string;
  page?: number;
  pageSize?: number;
  condition?: string;
  brandIds?: number[];
  storeIds?: number[];
  skuCodes?: string[];
  kategoriBrands?: string[];
  grouping?: SummaryGrouping;
  sortField?: StockItemsSortField;
  sortDirection?: SortDirection;
  overstockGroup?: string; // 'ringan', 'sedang', or 'berat'
}

const serializeIds = (ids?: number[]) => (ids && ids.length > 0 ? ids.join(',') : undefined);
const serializeStrings = (values?: string[]) => (values && values.length > 0 ? values.join(',') : undefined);

export const stockHealthService = {
  async getItems(params: StockHealthFilterParams): Promise<StockHealthItemsResponse> {
    const response = await api.get<StockHealthItemsResponse>(`${ANALYTICS_BASE}/items`, {
      params: {
        stock_date: params.stockDate,
        page: params.page ?? 1,
        page_size: params.pageSize ?? 2000,
        condition: params.condition,
        brand_ids: serializeIds(params.brandIds),
        store_ids: serializeIds(params.storeIds),
        sku_ids: serializeStrings(params.skuCodes),
        kategori_brand: params.kategoriBrands && params.kategoriBrands.length > 0
          ? params.kategoriBrands.map((v) => v.toUpperCase()).join(',')
          : undefined,
        grouping: params.grouping,
        sort_field: params.sortField,
        sort_direction: params.sortDirection,
        overstock_group: params.overstockGroup,
      },
    });

    return response.data;
  },

  async getAvailableDatesWithLatest(limit = 30): Promise<{ dates: string[]; latestDate: string | null }> {
    const response = await api.get<AvailableDatesResponse>(`${ANALYTICS_BASE}/available_dates`, {
      params: { limit },
    });

    const rawDates = response.data?.dates ?? [];
    const normalizedDates = rawDates.map((date) => date.split('T')[0]);

    return {
      dates: normalizedDates,
      latestDate: normalizedDates[0] ?? null,
    };
  },

  async getAvailableDates(limit = 30): Promise<string[]> {
    const { dates } = await this.getAvailableDatesWithLatest(limit);
    return dates;
  },

  async getSummary(params: { stockDate: string }): Promise<StockHealthSummaryResponse> {
    const response = await api.get<StockHealthSummaryResponse>(`${ANALYTICS_BASE}/summary`, {
      params: {
        stock_date: params.stockDate,
      },
    });

    return response.data;
  },

  async getTimeSeries(params: { stockDate: string; days?: number }): Promise<TimeSeriesResponse> {
    const response = await api.get<TimeSeriesResponse>(`${ANALYTICS_BASE}/time_series`, {
      params: {
        stock_date: params.stockDate,
        days: params.days ?? 30,
      },
    });
    return response.data;
  },

  async getDashboard(params: { stockDate: string; brandIds?: number[]; storeIds?: number[]; skuCodes?: string[]; kategoriBrands?: string[]; days?: number }): Promise<StockHealthDashboardResponse> {
    const response = await api.get<StockHealthDashboardResponse>(`${ANALYTICS_BASE}/dashboard`, {
      params: {
        stock_date: params.stockDate,
        days: params.days ?? 30,
        brand_ids: serializeIds(params.brandIds),
        store_ids: serializeIds(params.storeIds),
        sku_ids: serializeStrings(params.skuCodes),
        kategori_brand: params.kategoriBrands && params.kategoriBrands.length > 0
          ? params.kategoriBrands.map((v) => v.toUpperCase()).join(',')
          : undefined,
      },
    });
    return response.data;
  },

  async getKategoriBrands(): Promise<string[]> {
    const response = await api.get<{ kategori_brands: string[] }>(`${ANALYTICS_BASE}/kategori_brands`);
    return response.data?.kategori_brands ?? [];
  },
};
