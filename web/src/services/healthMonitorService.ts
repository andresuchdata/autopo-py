import { cache } from '@/lib/cache';

const API_BASE = '/api';

export interface HealthMonitorData {
  [key: string]: any;
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
    const cached = await this.cache.get<HealthMonitorData>(cacheKey);
    if (cached) return cached;

    // Fetch from API
    const response = await fetch(`${API_BASE}/health-monitor?date=${date}`);
    if (!response.ok) {
      throw new Error('Failed to fetch health monitor data');
    }

    const data = await response.json();
    const result = data.data || data;

    // Cache the result
    await this.cache.set(cacheKey, result);
    return result;
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
