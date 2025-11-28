"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useEffect, useState, useCallback } from 'react';
import { Skeleton } from "@/components/ui/skeleton";
import { StockHealthFilters } from './StockHealthFilters';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useDashboard } from "@/hooks/useDashboard";
import { format } from 'date-fns';
import dayjs from 'dayjs';

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
  const [healthData, setHealthData] = useState<any>(null);
  const [filters, setFilters] = useState<{brand?: string; store?: string}>({});
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [selectedCondition, setSelectedCondition] = useState<keyof typeof COLORS | null>(null);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  
  const {
    data,
    loading,
    error,
    selectedDate,
    lastUpdated,
    onDateChange,
    refresh
  } = useDashboard();

  // Process data when it's loaded
  useEffect(() => {
    if (data) {
      processData(data);
    }
  }, [data]);

  const processData = (dashboardData: any) => {
    if (!dashboardData) return;

    // Process the data for the dashboard
    const items = dashboardData.summary?.items || [];
    const byBrand = dashboardData.summary?.byBrand || [];
    const byStore = dashboardData.summary?.byStore || [];
    const brands = [...new Set(items.map((item: any) => item.brand))].filter(Boolean);
    const stores = [...new Set(items.map((item: any) => item.store))].filter(Boolean);

    setHealthData({
      byBrand,
      byStore,
      items,
      brands,
      stores,
      filteredItems: items // Initialize filtered items with all items
    });
  };

  const getStockCondition = (stock: number, dailySales: number): keyof typeof COLORS => {
    if (stock === 0) return 'out_of_stock';
    if (dailySales === 0) return 'nearly_out';
    
    const daysOfCover = stock / dailySales;
    if (daysOfCover > 30) return 'overstock';
    if (daysOfCover > 15) return 'healthy';
    if (daysOfCover > 7) return 'low';
    return 'nearly_out';
  };

  const handleFilterChange = (newFilters: any) => {
    setFilters(newFilters);
    // Apply filters to the data
    if (healthData) {
      const filteredItems = healthData.items.filter((item: any) => {
        const matchesBrand = newFilters.brand ? item.brand === newFilters.brand : true;
        const matchesStore = newFilters.store ? item.store === newFilters.store : true;
        return matchesBrand && matchesStore;
      });
      setHealthData((prev: any) => ({
        ...prev,
        filteredItems
      }));
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>Error loading data: {error}</p>
          <button 
            onClick={() => refresh()} 
            className="mt-2 bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const handleCardClick = (condition: keyof typeof COLORS) => {
    setSelectedCondition(condition);
    setIsDialogOpen(true);
    setIsLoadingItems(true);
    
    // Filter items based on the selected condition
    const filteredItems = healthData?.items?.filter((item: any) => 
      item.condition === condition
    ) || [];
    
    setStockItems(filteredItems);
    setIsLoadingItems(false);
  };

  const formatValue = (value: number, title: string) => {
    if (title.includes('Value')) {
      // Format as currency for value chart
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
        minimumFractionDigits: 0
      }).format(value);
    } else if (title.includes('Stock')) {
      // Format with thousand separators for stock
      return new Intl.NumberFormat('id-ID').format(value);
    }
    return value;
  };

  const renderPieChart = (data: any[], dataKey: string, nameKey: string, title: string) => {
    if (!data || data.length === 0) return null;
    
    // Calculate total for percentage calculation
    const total = data.reduce((sum, item) => sum + (item.value || 0), 0);
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey={dataKey}
                nameKey={nameKey}
                label={(props) => {
                  const { value, payload } = props;
                  const percentage = total > 0 ? (value / total) * 100 : 0;
                  return `${CONDITION_LABELS[payload.condition as keyof typeof CONDITION_LABELS].split(' ')[0]}\n${percentage.toFixed(0)}%`;
                }}
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[entry.condition as keyof typeof COLORS] || '#999999'} 
                  />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any, name: any, props: any) => {
                  const percentage = total > 0 ? (props.value / total) * 100 : 0;
                  return [
                    `${formatValue(props.value, title)} (${percentage.toFixed(1)}%)`,
                    CONDITION_LABELS[props.payload.condition as keyof typeof CONDITION_LABELS]
                  ];
                }}
              />
              <Legend 
                formatter={(value, entry: any, index) => {
                  const condition = data[index]?.condition;
                  return CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const renderFilters = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
      <div className="space-y-2">
        <Label htmlFor="brand-filter">Brand</Label>
        <Select 
          onValueChange={(value) => handleFilterChange({ ...filters, brand: value === 'all' ? undefined : value })}
          value={filters.brand || 'all'}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            {healthData?.brands?.map((brand: string) => (
              <SelectItem key={brand} value={brand}>{brand}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="store-filter">Store</Label>
        <Select
          onValueChange={(value) => handleFilterChange({ ...filters, store: value === 'all' ? undefined : value })}
          value={filters.store || 'all'}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select store" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stores</SelectItem>
            {healthData?.stores?.map((store: string) => (
              <SelectItem key={store} value={store}>{store}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-100 rounded-md">
        <p>{error}</p>
        <Button 
          className="mt-2" 
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Stock Health Dashboard</h2>
        <div className="text-sm text-muted-foreground">
          {lastUpdated && `Last updated: ${format(new Date(lastUpdated), 'MMM d, yyyy HH:mm')}`}
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Object.entries(COLORS).map(([condition, color]) => (
              <Card 
                key={condition} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleCardClick(condition as keyof typeof COLORS)}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS]}
                  </CardTitle>
                  <div className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {data?.summary?.[condition as keyof typeof data.summary] || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(
                      ((data?.summary?.[condition as keyof typeof data.summary] || 0) / 
                       (data?.summary?.totalItems || 1)) * 100
                    )}% of total
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {renderFilters()}

          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
            {data?.charts?.pieDataBySkuCount?.length > 0 && renderPieChart(
              data?.charts?.pieDataBySkuCount || [],
              'value',
              'condition',
              'SKU Count by Condition'
            )}
            {data?.charts?.pieDataByStock?.length > 0 && renderPieChart(
              data?.charts?.pieDataByStock || [],
              'value',
              'condition',
              'Total Stock by Condition'
            )}
            {data?.charts?.pieDataByValue?.length > 0 && renderPieChart(
              data?.charts.pieDataByValue,
              'value',
              'condition',
              'Total Value by Condition (IDR)'
            )}
          </div>
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Daily Sales</TableHead>
                  <TableHead>Condition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {healthData?.items?.map((item: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell>{item.sku}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.brand}</TableCell>
                    <TableCell>{item.store}</TableCell>
                    <TableCell>{item.stock}</TableCell>
                    <TableCell>{item.dailySales.toFixed(2)}</TableCell>
                    <TableCell>
                      <span 
                        className="px-2 py-1 rounded-full text-xs"
                        style={{ 
                          backgroundColor: `${COLORS[item.condition as keyof typeof COLORS]}20`,
                          color: COLORS[item.condition as keyof typeof COLORS]
                        }}
                      >
                        {CONDITION_LABELS[item.condition as keyof typeof CONDITION_LABELS].split(' ')[0]}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCondition ? CONDITION_LABELS[selectedCondition] : 'Stock Items'}
            </DialogTitle>
            <DialogDescription>
              {stockItems.length} items found
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingItems ? (
            <div className="py-8 flex justify-center">
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Daily Sales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockItems.map((item: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell>{item.sku}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.brand}</TableCell>
                      <TableCell>{item.store}</TableCell>
                      <TableCell>{item.stock}</TableCell>
                      <TableCell>{item.dailySales.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}