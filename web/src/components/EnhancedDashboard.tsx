// /autopo/web/src/components/EnhancedDashboard.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useEffect, useState } from 'react';
import { Skeleton } from "@/components/ui/skeleton";
import { poService } from "@/services/api";
import { StockHealthFilters } from './StockHealthFilters';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const COLORS = {
  'overstock': '#3b82f6',      // Blue
  'healthy': '#10b981',        // Green
  'low': '#f59e0b',            // Yellow
  'nearly_out': '#ef4444',     // Red
  'out_of_stock': '#1f2937'    // Black
};

const CONDITION_LABELS = {
  'overstock': 'Biru (Long over stock)',
  'healthy': 'Hijau (Sehat)',
  'low': 'Kuning (Kurang)',
  'nearly_out': 'Merah (Menuju habis)',
  'out_of_stock': 'Hitam (Habis)'
};

interface StockItem {
  id: number;
  store_name: string;
  sku_code: string;
  sku_name: string;
  brand_name: string;
  current_stock: number;
  days_of_cover: number;
  condition: keyof typeof COLORS;
}

export function EnhancedDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({});
  const [selectedCondition, setSelectedCondition] = useState<keyof typeof COLORS | null>(null);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  // Mock data for fallback when API fails
  const mockData = {
    healthCounts: {
      'overstock': 15,
      'healthy': 45,
      'low': 25,
      'nearly_out': 10,
      'out_of_stock': 5
    },
    timeSeries: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      data: {
        'overstock': [10, 12, 15, 18, 20, 22, 25],
        'healthy': [30, 32, 35, 34, 36, 38, 40],
        'low': [20, 18, 15, 16, 14, 12, 10],
        'nearly_out': [5, 6, 8, 7, 6, 5, 4],
        'out_of_stock': [2, 1, 0, 1, 0, 1, 0]
      }
    }
  };

  const fetchData = async (filters = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      // Try to fetch stock health data
      // TODO: Uncomment when API is ready
      // const response = await poService.getStockHealth(filters);
      // setData(response.data);
      
      // For now, use mock data
      await new Promise(resolve => setTimeout(resolve, 1000));
      setData(mockData);
    } catch (err) {
      console.error('API Error:', err);
      setError('Failed to connect to the backend server. Using demo data.');
      setData(mockData); // Fallback to mock data
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = async (newFilters: any) => {
    setFilters(newFilters);
    await fetchData(newFilters);
  };

  const handleCardClick = async (condition: keyof typeof COLORS) => {
    setSelectedCondition(condition);
    setIsDialogOpen(true);
    setIsLoadingItems(true);
    
    try {
      // TODO: Uncomment when API is ready
      // const response = await poService.getStockItems({ condition, ...filters });
      // setStockItems(response.data);
      
      // Mock data for now
      await new Promise(resolve => setTimeout(resolve, 500));
      setStockItems(Array(5).fill(0).map((_, i) => ({
        id: i,
        store_name: 'Store ' + (i + 1),
        sku_code: 'SKU' + (1000 + i),
        sku_name: 'Product ' + (i + 1),
        brand_name: 'Brand ' + (i % 3 + 1),
        current_stock: [50, 20, 10, 5, 0][i % 5],
        days_of_cover: [35, 25, 15, 5, 0][i % 5],
        condition
      })));
    } catch (error) {
      console.error('Error fetching stock items:', error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !data) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-1/3 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[400px] w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">No data available</p>
              <p className="mt-2 text-sm text-yellow-600">
                Please check your internet connection and try again.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const pieData = Object.entries(data.healthCounts).map(([name, value]) => ({
    name: CONDITION_LABELS[name as keyof typeof CONDITION_LABELS] || name,
    value,
    color: COLORS[name as keyof typeof COLORS] || '#999',
    originalName: name
  }));

  const timeSeriesData = data.timeSeries.labels.map((label: string, index: number) => {
    const item: { name: string } & Record<string, number> = { name: label };
    Object.entries(data.timeSeries.data).forEach(([key, values]) => {
      item[CONDITION_LABELS[key as keyof typeof CONDITION_LABELS] || key] = (values as number[])[index] || 0;
    });
    return item;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Stock Health Dashboard</h1>
        {error && (
          <div className="px-4 py-2 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
            {error}
          </div>
        )}
      </div>
      
      {/* Filters */}
      <StockHealthFilters 
        onFilterChange={handleFilterChange} 
        loading={loading} 
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Stock Health Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => 
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {pieData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color} 
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleCardClick(entry.originalName as keyof typeof COLORS)}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value} items`, 'Count']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Time Series Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Stock Health Over Time</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={timeSeriesData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                {Object.entries(CONDITION_LABELS).map(([key, label]) => (
                  <Bar
                    key={key}
                    dataKey={label}
                    stackId="a"
                    fill={COLORS[key as keyof typeof COLORS]}
                    name={label}
                    animationDuration={1000}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {Object.entries(data.healthCounts).map(([category, count]) => (
          <Card 
            key={category} 
            className="border-l-4 cursor-pointer hover:shadow-md transition-shadow"
            style={{ borderLeftColor: COLORS[category as keyof typeof COLORS] }}
            onClick={() => handleCardClick(category as keyof typeof COLORS)}
          >
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-medium text-gray-700">
                {CONDITION_LABELS[category as keyof typeof CONDITION_LABELS] || category}
              </CardTitle>
              <p className="text-2xl font-bold">{count as React.ReactNode}</p>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Stock Items Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCondition ? CONDITION_LABELS[selectedCondition] : 'Stock Items'}
            </DialogTitle>
          </DialogHeader>
          
          {isLoadingItems ? (
            <div className="py-8 flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>SKU Code</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Current Stock</TableHead>
                  <TableHead>Days of Cover</TableHead>
                  <TableHead>Condition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.store_name}</TableCell>
                    <TableCell>{item.sku_code}</TableCell>
                    <TableCell>{item.sku_name}</TableCell>
                    <TableCell>{item.brand_name}</TableCell>
                    <TableCell>{item.current_stock}</TableCell>
                    <TableCell>{item.days_of_cover}</TableCell>
                    <TableCell>
                      <span 
                        className="px-2 py-1 text-xs font-medium rounded-full"
                        style={{ 
                          backgroundColor: `${COLORS[item.condition]}20`,
                          color: COLORS[item.condition]
                        }}
                      >
                        {CONDITION_LABELS[item.condition as keyof typeof CONDITION_LABELS] || item.condition}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {stockItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4 text-gray-500">
                      No items found for the selected condition.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}