"use client";

import React, { useEffect, useMemo, useState, UIEvent } from "react";
import { Check, ChevronsUpDown, Store as StoreIcon, Tag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePicker } from "@/components/ui/date-picker";
import { PODashboardFilterProvider, usePODashboardFilter } from "@/contexts/PODashboardFilterContext";
import { poService } from "@/services/api";
import { useSupplierOptions } from "@/hooks/useSupplierOptions";

interface PODashboardFilterProps {
  loading: boolean;
}

export const PODashboardFilter: React.FC<PODashboardFilterProps> = ({ loading }) => {
  const {
    poTypeFilter,
    setPOTypeFilter,
    releasedDateFilter,
    setReleasedDateFilter,
    storeIdsFilter,
    setStoreIdsFilter,
    brandIdsFilter,
    setBrandIdsFilter,
    supplierIdsFilter,
    setSupplierIdsFilter,
  } = usePODashboardFilter();

  const [stores, setStores] = useState<{ id: number; name: string }[]>([]);
  const [brands, setBrands] = useState<{ id: number; name: string }[]>([]);
  const [storeSearch, setStoreSearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");

  const {
    options: supplierOptions,
    loading: supplierSearchLoading,
    loadMoreLoading: supplierLoadMoreLoading,
    hasMore: supplierHasMoreOptions,
    search: supplierSearchFn,
    loadMore: supplierLoadMore,
  } = useSupplierOptions("");

  useEffect(() => {
    const loadInitialOptions = async () => {
      try {
        const [storesRes, brandsRes] = await Promise.all([
          poService.getStores(),
          poService.getBrands(),
        ]);
        setStores(storesRes.data ?? storesRes);
        setBrands(brandsRes.data ?? brandsRes);
      } catch (err) {
        console.error("Failed to load store/brand options", err);
      }
    };

    loadInitialOptions();
  }, []);

  const storeOptions = useMemo(() => stores.map((s) => ({ id: s.id, label: s.name })), [stores]);
  const brandOptions = useMemo(() => brands.map((b) => ({ id: b.id, label: b.name })), [brands]);

  const supplierDisplayOptions = useMemo(
    () => supplierOptions.map((s) => ({ id: s.id, label: s.name })),
    [supplierOptions]
  );

  const selectedStoresLabel = useMemo(() => {
    if (storeIdsFilter.length === 0) return "All Stores";
    if (storeIdsFilter.length === 1) {
      const match = storeOptions.find((s) => s.id === storeIdsFilter[0]);
      return match?.label ?? "1 store selected";
    }
    return `${storeIdsFilter.length} stores selected`;
  }, [storeIdsFilter, storeOptions]);

  const selectedBrandsLabel = useMemo(() => {
    if (brandIdsFilter.length === 0) return "All Brands";
    if (brandIdsFilter.length === 1) {
      const match = brandOptions.find((b) => b.id === brandIdsFilter[0]);
      return match?.label ?? "1 brand selected";
    }
    return `${brandIdsFilter.length} brands selected`;
  }, [brandIdsFilter, brandOptions]);

  const selectedSuppliersLabel = useMemo(() => {
    if (supplierIdsFilter.length === 0) return "All Suppliers";
    if (supplierIdsFilter.length === 1) {
      const match = supplierDisplayOptions.find((s) => s.id === supplierIdsFilter[0]);
      return match?.label ?? "1 supplier selected";
    }
    return `${supplierIdsFilter.length} suppliers selected`;
  }, [supplierIdsFilter, supplierDisplayOptions]);

  const handleClearFilters = () => {
    if (loading) return;
    setPOTypeFilter("ALL");
    setReleasedDateFilter("");
    setStoreIdsFilter([]);
    setBrandIdsFilter([]);
    setSupplierIdsFilter([]);
    setStoreSearch("");
    setBrandSearch("");
    setSupplierSearch("");
    setFiltersOpen(false);
  };

  const handleSupplierListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!supplierHasMoreOptions || supplierLoadMoreLoading || supplierSearchLoading) return;

    const target = event.currentTarget;
    const threshold = 32; // px before bottom to trigger load
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (distanceFromBottom <= threshold) {
      void supplierLoadMore();
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-medium uppercase text-muted-foreground">PO Type</Label>
        <Select
          value={poTypeFilter}
          onValueChange={(value: "ALL" | "AU" | "PO" | "OTHERS") => setPOTypeFilter(value)}
          disabled={loading}
        >
          <SelectTrigger className="w-40 h-10 bg-background border-border rounded-lg">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="AU">AU</SelectItem>
            <SelectItem value="PO">PO</SelectItem>
            <SelectItem value="OTHERS">Others</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-medium uppercase text-muted-foreground">PO Released Date</Label>
        <div className={loading ? "pointer-events-none opacity-60" : ""}>
          <DatePicker
            value={releasedDateFilter || undefined}
            onChange={(value) => {
              if (!loading) {
                setReleasedDateFilter(value as string);
              }
            }}
            placeholder="All Dates"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1.5">
          <StoreIcon className="h-3 w-3 text-primary/70" /> Store
        </Label>
        <Popover
          open={loading ? false : filtersOpen}
          onOpenChange={(open) => {
            if (!loading) {
              setFiltersOpen(open);
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-52 justify-between h-10 px-3 bg-background border-border rounded-lg font-normal"
              disabled={loading}
            >
              <span className="truncate text-left text-sm">{selectedStoresLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="end">
            <Command>
              <CommandInput
                placeholder="Search store..."
                value={storeSearch}
                onValueChange={setStoreSearch}
              />
              <CommandList className="max-h-64 overflow-auto">
                <CommandEmpty>No store found.</CommandEmpty>
                <CommandGroup>
                  {storeOptions
                    .filter((opt) =>
                      storeSearch ? opt.label.toLowerCase().includes(storeSearch.toLowerCase()) : true
                    )
                    .map((opt) => {
                      const isSelected = storeIdsFilter.includes(opt.id);
                      return (
                        <CommandItem
                          key={opt.id}
                          onSelect={() => {
                            if (isSelected) {
                              setStoreIdsFilter(storeIdsFilter.filter((id) => id !== opt.id));
                            } else {
                              setStoreIdsFilter([...storeIdsFilter, opt.id]);
                            }
                          }}
                        >
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all ${
                            isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                          }`}>
                            <Check className="h-3 w-3" />
                          </div>
                          <span className="truncate text-sm">{opt.label}</span>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1.5">
          <Tag className="h-3 w-3 text-primary/70" /> Supplier
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-52 justify-between h-10 px-3 bg-background border-border rounded-lg font-normal"
              disabled={loading || supplierSearchLoading}
            >
              <span className="truncate text-left text-sm">{selectedSuppliersLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="end">
            <Command>
              <CommandInput
                placeholder="Search supplier..."
                value={supplierSearch}
                onValueChange={(value) => {
                  setSupplierSearch(value);
                  void supplierSearchFn(value);
                }}
              />
              <CommandList className="max-h-64 overflow-auto" onScroll={handleSupplierListScroll}>
                <CommandEmpty>No supplier found.</CommandEmpty>
                <CommandGroup>
                  {supplierDisplayOptions
                    .filter((opt) =>
                      supplierSearch
                        ? opt.label.toLowerCase().includes(supplierSearch.toLowerCase())
                        : true
                    )
                    .map((opt) => {
                      const isSelected = supplierIdsFilter.includes(opt.id);
                      return (
                        <CommandItem
                          key={opt.id}
                          onSelect={() => {
                            if (isSelected) {
                              setSupplierIdsFilter(
                                supplierIdsFilter.filter((id) => id !== opt.id)
                              );
                            } else {
                              setSupplierIdsFilter([...supplierIdsFilter, opt.id]);
                            }
                          }}
                        >
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all ${
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "opacity-50 [&_svg]:invisible"
                            }`}
                          >
                            <Check className="h-3 w-3" />
                          </div>
                          <span className="truncate text-sm">{opt.label}</span>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1.5">
          <Tag className="h-3 w-3 text-primary/70" /> Brand
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-52 justify-between h-10 px-3 bg-background border-border rounded-lg font-normal"
              disabled={loading}
            >
              <span className="truncate text-left text-sm">{selectedBrandsLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="end">
            <Command>
              <CommandInput
                placeholder="Search brand..."
                value={brandSearch}
                onValueChange={setBrandSearch}
              />
              <CommandList className="max-h-64 overflow-auto">
                <CommandEmpty>No brand found.</CommandEmpty>
                <CommandGroup>
                  {brandOptions
                    .filter((opt) =>
                      brandSearch ? opt.label.toLowerCase().includes(brandSearch.toLowerCase()) : true
                    )
                    .map((opt) => {
                      const isSelected = brandIdsFilter.includes(opt.id);
                      return (
                        <CommandItem
                          key={opt.id}
                          onSelect={() => {
                            if (isSelected) {
                              setBrandIdsFilter(brandIdsFilter.filter((id) => id !== opt.id));
                            } else {
                              setBrandIdsFilter([...brandIdsFilter, opt.id]);
                            }
                          }}
                        >
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all ${
                            isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                          }`}>
                            <Check className="h-3 w-3" />
                          </div>
                          <span className="truncate text-sm">{opt.label}</span>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-end pb-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={handleClearFilters}
          disabled={loading}
        >
          Clear filters
        </Button>
      </div>
    </div>
  );
};
