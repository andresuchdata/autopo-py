"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import {  useState } from 'react';
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

  // Render the pie chart with filtered data
  const renderPieChart = (data: any, dataKey: string, nameKey: string, title: string) => {
    if (!data || data.length === 0) return null;
    
    const total = data.reduce((sum: number, item: any) => sum + (item[dataKey] || 0), 0);
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
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
                {data.map((entry: any, index: number) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[entry.condition as keyof typeof COLORS] || '#999999'} 
                  />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any, name: any, props: any) => [
                  value,
                  CONDITION_LABELS[props.payload.condition as keyof typeof CONDITION_LABELS]
                ]}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  // Render filter controls
  const renderFilters = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div>
        <Label htmlFor="brand-filter">Brand</Label>
        <Select
          value={filters.brand || ''}
          onValueChange={(value) => handleFilterChange({ ...filters, brand: value || undefined })}
        >
          <SelectTrigger id="brand-filter">
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
      <div>
        <Label htmlFor="store-filter">Store</Label>
        <Select
          value={filters.store || ''}
          onValueChange={(value) => handleFilterChange({ ...filters, store: value || undefined })}
        >
          <SelectTrigger id="store-filter">
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
          className="w-full"
        >
          Clear Filters
        </Button>
      </div>
    </div>
  );

  // Render the dashboard
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Stock Health Dashboard</h2>
        <div className="text-sm text-muted-foreground">
          {lastUpdated && `Last updated: ${new Date(lastUpdated).toLocaleString()}`}
        </div>
      </div>

      {renderFilters()}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Object.entries(COLORS).map(([condition, color]) => {
          const items = filteredData?.items || [];
          const count = filteredData?.summary.byCondition[condition as ConditionKey] || 0;
          const total = items.length || 1;
          const percentage = Math.round((count / total) * 100);
          
          return (
            <Card 
              key={condition} 
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => handleCardClick(condition as keyof typeof COLORS)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS]}
                </CardTitle>
                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{count}</div>
                <p className="text-xs text-muted-foreground">
                  {percentage}% of total
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
        {(() => {
          if (!filteredData) return null;
          
          return (
            <>
              {filteredData.byBrand && filteredData.byBrand.get(filters.brand?? '') && (
                <Card>
                  <CardHeader>
                    <CardTitle>By Brand</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={filteredData.byBrand.get(filters.brand?? '')}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis dataKey="brand" type="category" width={100} />
                          <Tooltip />
                          <Legend />
                          {Object.entries(COLORS).map(([condition, color]) => (
                            <Bar 
                              key={condition} 
                              dataKey={condition} 
                              fill={color} 
                              name={CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS]}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {filteredData.byStore && (
                <Card>
                  <CardHeader>
                    <CardTitle>By Store</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={filteredData.byStore.get(filters.store?? '')}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis dataKey="store" type="category" width={100} />
                          <Tooltip />
                          <Legend />
                          {Object.entries(COLORS).map(([condition, color]) => (
                            <Bar 
                              key={condition} 
                              dataKey={condition} 
                              fill={color} 
                              name={CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS]}
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
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {selectedCondition && CONDITION_LABELS[selectedCondition]}
            </DialogTitle>
            <DialogDescription>
              Showing {stockItems.length} items
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>SKU Code</TableHead>
                  <TableHead>SKU Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Days of Cover</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingItems ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : stockItems.length > 0 ? (
                  stockItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.store_name}</TableCell>
                      <TableCell>{item.sku_code}</TableCell>
                      <TableCell>{item.sku_name}</TableCell>
                      <TableCell>{item.brand_name}</TableCell>
                      <TableCell>{item.current_stock}</TableCell>
                      <TableCell>{item.days_of_cover.toFixed(1)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4">
                      No items found
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