import { api } from '@/services/api';

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
  days_of_cover: number;
  stock_date: string;
  last_updated: string;
  stock_condition: string;
}

interface StockHealthItemsResponse {
  items: StockHealthApiItem[];
  total: number;
}

interface AvailableDatesResponse {
  dates: string[];
}

export interface StockHealthFilterParams {
  stockDate: string;
  page?: number;
  pageSize?: number;
  condition?: string;
}

export const stockHealthService = {
  async getItems(params: StockHealthFilterParams): Promise<StockHealthItemsResponse> {
    const response = await api.get<StockHealthItemsResponse>(`${ANALYTICS_BASE}/items`, {
      params: {
        stock_date: params.stockDate,
        page: params.page ?? 1,
        page_size: params.pageSize ?? 2000,
        condition: params.condition,
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
};
