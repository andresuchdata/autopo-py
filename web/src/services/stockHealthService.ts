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
  kategori_brand?: string;
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

export interface StockHealthSummary {
  condition: string;
  count: number;
  total_stock: number;
  total_value: number;
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

export interface OverstockBreakdownResponse {
  category: string;
  count: number;
  total_stock: number;
  total_value: number;
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

const buildFilterQuery = (params: StockHealthFilterParams) => ({
  stock_date: params.stockDate,
  condition: params.condition,
  brand_ids: serializeIds(params.brandIds),
  store_ids: serializeIds(params.storeIds),
  sku_ids: serializeStrings(params.skuCodes),
  kategori_brand: serializeStrings(params.kategoriBrands),
  overstock_group: params.overstockGroup,
});

export const stockHealthService = {
  async getItems(params: StockHealthFilterParams): Promise<StockHealthItemsResponse> {
    const response = await api.get<StockHealthItemsResponse>(`${ANALYTICS_BASE}/items`, {
      params: {
        ...buildFilterQuery(params),
        page: params.page ?? 1,
        page_size: params.pageSize ?? 2000,
        grouping: params.grouping,
        sort_field: params.sortField,
        sort_direction: params.sortDirection,
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

  async getSummary(params: StockHealthFilterParams): Promise<StockHealthSummary[]> {
    const response = await api.get<StockHealthSummary[]>(`${ANALYTICS_BASE}/summary`, {
      params: buildFilterQuery(params),
    });
    return response.data ?? [];
  },

  async getBrandBreakdown(params: StockHealthFilterParams): Promise<ConditionBreakdownResponse[]> {
    const response = await api.get<ConditionBreakdownResponse[]>(`${ANALYTICS_BASE}/breakdown/brands`, {
      params: buildFilterQuery(params),
    });
    return response.data ?? [];
  },

  async getStoreBreakdown(params: StockHealthFilterParams): Promise<ConditionBreakdownResponse[]> {
    const response = await api.get<ConditionBreakdownResponse[]>(`${ANALYTICS_BASE}/breakdown/stores`, {
      params: buildFilterQuery(params),
    });
    return response.data ?? [];
  },

  async getOverstockBreakdown(params: StockHealthFilterParams): Promise<OverstockBreakdownResponse[]> {
    const response = await api.get<OverstockBreakdownResponse[]>(`${ANALYTICS_BASE}/breakdown/overstock`, {
      params: buildFilterQuery(params),
    });
    return response.data ?? [];
  },

  async getKategoriBrands(): Promise<string[]> {
    const response = await api.get<{ kategori_brands: string[] }>(`${ANALYTICS_BASE}/kategori_brands`);
    return response.data?.kategori_brands ?? [];
  },
};
