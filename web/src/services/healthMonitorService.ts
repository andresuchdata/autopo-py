import { cache } from '@/lib/cache';

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

  private constructor() {}

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

    // Fetch from API
    console.log(`[HealthMonitorService] Cache miss for ${date}, fetching from API`);
    const response = await fetch(`${API_BASE}/health-monitor?date=${date}`);
    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      console.error(`[HealthMonitorService] API error (${response.status}):`, error);
      throw new Error(`Failed to fetch health monitor data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
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
    const cacheKey = 'latest-health-monitor-date';
    const cached = await this.cache.get<string>(cacheKey);
    if (cached) return cached;

    // Get the folder ID for health_monitor from environment variables
    const folderId = process.env.NEXT_PUBLIC_HEALTH_MONITOR_FOLDER_ID;
    if (!folderId) {
      throw new Error('Health monitor folder ID is not configured');
    }

    const response = await fetch(`${API_BASE}/drive?folderId=${folderId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch health monitor files');
    }

    const files = await response.json();
    const dates = files
      .map((file: { name: string }) => file.name.replace('.csv', ''))
      .filter((date: string) => /^\d{8}$/.test(date))
      .sort((a: string, b: string) => b.localeCompare(a));

    const latestDate = dates[0] || null;
    if (latestDate) {
      await this.cache.set(cacheKey, latestDate);
    }

    return latestDate;
  }
}

export const healthMonitorService = HealthMonitorService.getInstance();
