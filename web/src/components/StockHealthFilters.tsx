// /autopo/web/src/components/StockHealthFilters.tsx
"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { poService } from '@/services/api';

const formSchema = z.object({
  store: z.string().optional(),
  sku: z.string().optional(),
  brand: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface StockHealthFiltersProps {
  onFilterChange: (filters: {
    storeIds?: number[];
    skuIds?: number[];
    brandIds?: number[];
  }) => void;
  loading?: boolean;
}

export function StockHealthFilters({ onFilterChange, loading }: StockHealthFiltersProps) {
  const [stores, setStores] = useState<{ id: number; name: string }[]>([]);
  const [skus, setSkus] = useState<{ id: number; name: string; sku_code: string }[]>([]);
  const [brands, setBrands] = useState<{ id: number; name: string }[]>([]);
  const [searchTerm, setSearchTerm] = useState({
    store: '',
    sku: '',
    brand: '',
  });

  const { register, handleSubmit, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [storesRes, brandsRes] = await Promise.all([
          poService.getStores(),
          poService.getBrands(),
        ]);
        setStores(storesRes.data);
        setBrands(brandsRes.data);
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    };

    fetchInitialData();
  }, []);

  // Handle search for stores
  const handleStoreSearch = async (search: string) => {
    setSearchTerm(prev => ({ ...prev, store: search }));
    try {
      const res = await poService.getStores({ search });
      setStores(res.data);
    } catch (error) {
      console.error('Error searching stores:', error);
    }
  };

  // Handle search for SKUs
  const handleSkuSearch = async (search: string) => {
    setSearchTerm(prev => ({ ...prev, sku: search }));
    try {
      const res = await poService.getSkus({ search });
      setSkus(res.data);
    } catch (error) {
      console.error('Error searching SKUs:', error);
    }
  };

  // Handle search for brands
  const handleBrandSearch = async (search: string) => {
    setSearchTerm(prev => ({ ...prev, brand: search }));
    try {
      const res = await poService.getBrands({ search });
      setBrands(res.data);
    } catch (error) {
      console.error('Error searching brands:', error);
    }
  };

  const onSubmit = (data: FormData) => {
    onFilterChange({
      storeIds: data.store ? [parseInt(data.store)] : undefined,
      skuIds: data.sku ? [parseInt(data.sku)] : undefined,
      brandIds: data.brand ? [parseInt(data.brand)] : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-4 bg-gray-50 rounded-lg">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Store Select */}
        <div className="space-y-2">
          <Label htmlFor="store">Store</Label>
          <Select
            onValueChange={(value) => setValue('store', value)}
            onOpenChange={(open) => open && handleStoreSearch('')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select store" />
            </SelectTrigger>
            <SelectContent>
              <div className="px-3 py-2">
                <Input
                  placeholder="Search stores..."
                  value={searchTerm.store}
                  onChange={(e) => handleStoreSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id.toString()}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* SKU Select */}
        <div className="space-y-2">
          <Label htmlFor="sku">SKU</Label>
          <Select
            onValueChange={(value) => setValue('sku', value)}
            onOpenChange={(open) => open && handleSkuSearch('')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select SKU" />
            </SelectTrigger>
            <SelectContent>
              <div className="px-3 py-2">
                <Input
                  placeholder="Search SKUs..."
                  value={searchTerm.sku}
                  onChange={(e) => handleSkuSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {skus.map((sku) => (
                <SelectItem key={sku.id} value={sku.id.toString()}>
                  {sku.sku_code} - {sku.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Brand Select */}
        <div className="space-y-2">
          <Label htmlFor="brand">Brand</Label>
          <Select
            onValueChange={(value) => setValue('brand', value)}
            onOpenChange={(open) => open && handleBrandSearch('')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select brand" />
            </SelectTrigger>
            <SelectContent>
              <div className="px-3 py-2">
                <Input
                  placeholder="Search brands..."
                  value={searchTerm.brand}
                  onChange={(e) => handleBrandSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id.toString()}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? 'Applying...' : 'Apply Filters'}
        </Button>
      </div>
    </form>
  );
}