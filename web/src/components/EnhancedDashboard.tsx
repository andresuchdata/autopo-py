"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useState } from 'react';
import { ConditionKey } from '@/services/dashboardService';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useDashboard } from "@/hooks/useDashboard";

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

// In EnhancedDashboard.tsx
export function EnhancedDashboard() {
  const {
    data,
    filteredData,
    loading,
    error,
    selectedDate,
    lastUpdated,
    onDateChange,
    refresh,
    filters,
    setFilters,
    brands,
    stores,
  } = useDashboard();

  const [selectedCondition, setSelectedCondition] = useState<keyof typeof COLORS | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  // Handle filter changes
  const handleFilterChange = (newFilters: { brand?: string; store?: string }) => {
    setFilters(newFilters);
  };

  // Handle card click to show items for a specific condition
  const handleCardClick = async (condition: keyof typeof COLORS) => {
    setSelectedCondition(condition);
    setIsLoadingItems(true);
    try {
      if (!filteredData) return;

      // Get filtered items for the selected condition
      const items = filteredData.items
        .filter(item => item.condition === condition)
        .map((item, index) => ({
          id: index,
          store_name: item.store,
          sku_code: item.sku,
          sku_name: item.name,
          brand_name: item.brand,
          current_stock: item.stock,
          days_of_cover: item.daysOfCover,
          condition: item.condition,
        }));

      setStockItems(items);
      setIsDialogOpen(true);
    } catch (err) {
      console.error('Error loading items:', err);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Render a single pie chart
  const renderPieChart = (
    data: any[],
    title: string,
    valueFormatter?: (value: number) => string
  ) => {
    if (!data || data.length === 0) return null;

    const total = data.reduce((sum, item) => sum + item.value, 0);

    return (
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-center">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                nameKey="condition"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[entry.condition as keyof typeof COLORS] || '#999999'}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string, props: any) => [
                  valueFormatter ? valueFormatter(value) : value.toLocaleString(),
                  CONDITION_LABELS[props.payload.condition as keyof typeof CONDITION_LABELS]
                ]}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value, entry: any) => {
                  const item = data.find(d => d.condition === entry.payload.condition);
                  const percent = item ? ((item.value / total) * 100).toFixed(0) : 0;
                  return <span className="text-xs text-gray-600 ml-1">{`${CONDITION_LABELS[value as keyof typeof CONDITION_LABELS].split(' ')[0]} (${percent}%)`}</span>;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  // Render filter controls
  const renderFilters = () => (
    <div className="flex flex-col md:flex-row gap-4 mb-8 bg-white p-4 rounded-lg shadow-sm border">
      <div className="flex-1">
        <Label htmlFor="brand-filter" className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block">Brand</Label>
        <Select
          value={filters.brand || ''}
          onValueChange={(value) => handleFilterChange({ ...filters, brand: value === 'all' ? undefined : value })}
        >
          <SelectTrigger id="brand-filter" className="w-full">
            <SelectValue placeholder="All Brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            {brands?.map((brand) => (
              <SelectItem key={brand} value={brand}>
                {brand}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1">
        <Label htmlFor="store-filter" className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block">Store</Label>
        <Select
          value={filters.store || ''}
          onValueChange={(value) => handleFilterChange({ ...filters, store: value === 'all' ? undefined : value })}
        >
          <SelectTrigger id="store-filter" className="w-full">
            <SelectValue placeholder="All Stores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stores</SelectItem>
            {stores?.map((store) => (
              <SelectItem key={store} value={store}>
                {store}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end">
        <Button
          variant="outline"
          onClick={() => handleFilterChange({})}
          className="w-full md:w-auto whitespace-nowrap"
        >
          Clear Filters
        </Button>
      </div>
    </div>
  );

  // Helper to format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading && !data) {
    return <div className="flex justify-center items-center h-96">Loading dashboard data...</div>;
  }

  if (error) {
    return <div className="text-red-500 p-4 border border-red-200 rounded bg-red-50">Error: {error}</div>;
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Stock Health Dashboard</h2>
          <p className="text-muted-foreground mt-1">Overview of inventory health across brands and stores.</p>
        </div>
        <div className="text-sm text-muted-foreground bg-gray-100 px-3 py-1 rounded-full">
          {lastUpdated && `Last updated: ${new Date(lastUpdated).toLocaleString()}`}
        </div>
      </div>

      {renderFilters()}

      {/* Summary Cards Row */}
      <div className="grid gap-4 md:grid-cols-5">
        {Object.entries(COLORS).map(([condition, color]) => {
          const count = filteredData?.summary.byCondition[condition as ConditionKey] || 0;
          const total = filteredData?.summary.total || 1;
          const percentage = Math.round((count / total) * 100);

          return (
            <Card
              key={condition}
              className="cursor-pointer hover:shadow-md transition-all border-t-4"
              style={{ borderTopColor: color }}
              onClick={() => handleCardClick(condition as keyof typeof COLORS)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS].split(' ')[0]}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold">{count.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {percentage}% of total
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pie Charts Row */}
      {filteredData?.charts && (
        <div className="grid gap-6 md:grid-cols-3">
          {renderPieChart(
            filteredData.charts.pieDataBySkuCount,
            "SKU Count Distribution"
          )}
          {renderPieChart(
            filteredData.charts.pieDataByStock,
            "Total Stock Quantity"
          )}
          {renderPieChart(
            filteredData.charts.pieDataByValue,
            "Total Value (HPP)",
            formatCurrency
          )}
        </div>
      )}

      {/* Detailed Breakdowns */}
      <div className="grid gap-6 md:grid-cols-2">
        {(() => {
          if (!filteredData) return null;

          return (
            <>
              {filteredData.byBrand && filteredData.byBrand.size > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Breakdown by Brand</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={Array.from(filteredData.byBrand.entries()).map(([brand, items]) => {
                            const counts = items.reduce((acc, item) => {
                              acc[item.condition] = (acc[item.condition] || 0) + 1;
                              return acc;
                            }, {} as Record<string, number>);
                            return { brand, ...counts };
                          })}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" />
                          <YAxis dataKey="brand" type="category" width={100} tick={{ fontSize: 12 }} />
                          <Tooltip cursor={{ fill: 'transparent' }} />
                          <Legend />
                          {Object.entries(COLORS).map(([condition, color]) => (
                            <Bar
                              key={condition}
                              dataKey={condition}
                              stackId="a"
                              fill={color}
                              name={CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS].split(' ')[0]}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {filteredData.byStore && filteredData.byStore.size > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Breakdown by Store</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={Array.from(filteredData.byStore.entries()).map(([store, items]) => {
                            const counts = items.reduce((acc, item) => {
                              acc[item.condition] = (acc[item.condition] || 0) + 1;
                              return acc;
                            }, {} as Record<string, number>);
                            return { store, ...counts };
                          })}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" />
                          <YAxis dataKey="store" type="category" width={100} tick={{ fontSize: 12 }} />
                          <Tooltip cursor={{ fill: 'transparent' }} />
                          <Legend />
                          {Object.entries(COLORS).map(([condition, color]) => (
                            <Bar
                              key={condition}
                              dataKey={condition}
                              stackId="a"
                              fill={color}
                              name={CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS].split(' ')[0]}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          );
        })()}
      </div>

      {/* Item Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full" style={{ backgroundColor: selectedCondition ? COLORS[selectedCondition] : 'gray' }} />
              {selectedCondition && CONDITION_LABELS[selectedCondition]}
            </DialogTitle>
            <DialogDescription>
              Showing {stockItems.length} items
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>SKU Code</TableHead>
                  <TableHead>SKU Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Days of Cover</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingItems ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading items...
                    </TableCell>
                  </TableRow>
                ) : stockItems.length > 0 ? (
                  stockItems.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{item.store_name}</TableCell>
                      <TableCell className="font-mono text-xs">{item.sku_code}</TableCell>
                      <TableCell className="max-w-[300px] truncate" title={item.sku_name}>{item.sku_name}</TableCell>
                      <TableCell>{item.brand_name}</TableCell>
                      <TableCell className="text-right font-mono">{item.current_stock}</TableCell>
                      <TableCell className="text-right font-mono">{item.days_of_cover.toFixed(1)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No items found matching this criteria
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}