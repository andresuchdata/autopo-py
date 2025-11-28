import { healthMonitorService, HealthMonitorData } from './healthMonitorService';

export class DashboardService {
  private static instance: DashboardService;

  static getInstance(): DashboardService {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
    }
    return DashboardService.instance;
  }

  async getDashboardData(date: string) {
    const data = await healthMonitorService.getData(date);
    
    return {
      summary: this.calculateSummary(data),
      charts: this.prepareChartData(data),
    };
  }

  private calculateSummary(data: HealthMonitorData) {
    return {
      totalItems: data.items?.length || 0,
    };
  }

  private prepareChartData(data: HealthMonitorData) {
    return {};
  }
}

export const dashboardService = DashboardService.getInstance();
