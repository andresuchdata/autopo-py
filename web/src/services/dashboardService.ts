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
      rawData: data.data // Pass through raw data for the dashboard to use
    };
  }

  private calculateSummary(data: HealthMonitorData) {
    return {
      totalItems: data.data?.length || 0,
    };
  }

  private prepareChartData(data: HealthMonitorData) {
    const items = data.data || [];
    
    // Count items by condition
    const conditionCounts = items.reduce((acc, item) => {
      const condition = item.condition || 'unknown';
      acc[condition] = (acc[condition] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Prepare data for pie chart
    const pieData = Object.entries(conditionCounts).map(([name, value]) => ({
      name,
      value,
    }));

    return {
      conditionCounts,
      pieData,
    };
  }
}

export const dashboardService = DashboardService.getInstance();
