import { cache } from '@/lib/cache';
import { fetchFromAPI } from '@/lib/api';

const API_BASE = '/api';

export interface HealthMonitorData {
  data: Array<Record<string, any>>;
  meta?: {
    fields?: string[];
    [key: string]: any;
  };
  errors?: any[];
}

export class HealthMonitorService {
  private static instance: HealthMonitorService;
  private cache = cache;

  private constructor() { }

  static getInstance(): HealthMonitorService {
    if (!HealthMonitorService.instance) {
      HealthMonitorService.instance = new HealthMonitorService();
    }
    return HealthMonitorService.instance;
  }

  async getData(date: string): Promise<HealthMonitorData> {
    const cacheKey = `health-monitor-${date}`;

    // Try to get from cache first
    const cached = await this.cache.get<any>(cacheKey);

    if (cached) {
      console.log(`[HealthMonitorService] Returning cached data for ${date}`, {
        cacheKey,
        cachedDataLength: Array.isArray(cached) ? cached.length : 'not an array',
        cachedType: typeof cached,
        isArray: Array.isArray(cached),
        firstItem: Array.isArray(cached) && cached.length > 0 ? cached[0] : null
      });

      // Ensure we return the data in the correct format
      return {
        data: Array.isArray(cached) ? cached : [cached]
      };
    }

    // Fetch from API using our utility
    console.log(`[HealthMonitorService] Cache miss for ${date}, fetching from API`);
    const data = await fetchFromAPI(`/api/health-monitor?date=${date}`);
    const result = data.data || data;

    // Ensure we're storing an array in the cache
    const dataToCache = Array.isArray(result) ? result : [result];

    // Cache the result
    console.log(`[HealthMonitorService] Caching data for ${date}`, {
      dataLength: dataToCache.length,
      cacheKey
    });
    await this.cache.set(cacheKey, dataToCache);

    return { data: dataToCache };
  }

  async getLatestDate(): Promise<string | null> {
    const result = await this.getAvailableDatesWithLatest();
    return result.latestDate;
  }

  async getAvailableDates(): Promise<string[]> {
    const result = await this.getAvailableDatesWithLatest();
    return result.availableDates;
  }

  async getAvailableDatesWithLatest(): Promise<{ availableDates: string[]; latestDate: string | null }> {
    const cacheKey = 'available-health-monitor-dates';
    const cached = await this.cache.get<{ availableDates: string[]; latestDate: string | null }>(cacheKey);
    if (cached) return cached;

    // Get the folder ID for health_monitor from environment variables
    const folderId = process.env.NEXT_PUBLIC_HEALTH_MONITOR_FOLDER_ID;
    if (!folderId) {
      console.error('Health monitor folder ID is not configured. Please set NEXT_PUBLIC_HEALTH_MONITOR_FOLDER_ID in your environment variables.');
      return { availableDates: [], latestDate: null };
    }

    try {
      // Use our API utility for consistent request handling
      const files = await fetchFromAPI<Array<{name: string}>>(`/api/drive?folderId=${folderId}`);
      const dates = files
        .map((file) => file.name.replace('.csv', ''))
        .filter((date) => /^\d{8}$/.test(date))
        .sort((a, b) => b.localeCompare(a));

      const result = {
        availableDates: dates,
        latestDate: dates[0] || null
      };

      await this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error fetching available dates:', error);
      return { availableDates: [], latestDate: null };
    }
  }

}

export const healthMonitorService = HealthMonitorService.getInstance();
