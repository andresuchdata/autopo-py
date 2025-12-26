"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef, UIEvent } from "react";
import { flushSync } from "react-dom";
import { Check, ChevronsUpDown, Store as StoreIcon, Tag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePicker } from "@/components/ui/date-picker";
import { PODashboardFilterProvider, usePODashboardFilter } from "@/contexts/PODashboardFilterContext";
import { useSupplierOptions } from "@/hooks/useSupplierOptions";
import { useStoreOptions } from "@/hooks/useStoreOptions";
import { useBrandOptions } from "@/hooks/useBrandOptions";
import { FilterCheckboxItem } from "./FilterCheckboxItem";

const DEFAULT_SEARCH_DEBOUNCE = 300;

function useDebouncedCallback<T extends (...args: any[]) => unknown>(callback: T, delay = DEFAULT_SEARCH_DEBOUNCE) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        void callback(...args);
      }, delay);
    },
    [callback, delay]
  );
}

interface PODashboardFilterProps {
  loading: boolean;
}

export const PODashboardFilter: React.FC<PODashboardFilterProps> = ({ loading }) => {
  const {
    // Draft filters for UI
    draftPOTypeFilter,
    setDraftPOTypeFilter,
    draftReleasedDateFilter,
    setDraftReleasedDateFilter,
    draftStoreIdsFilter,
    setDraftStoreIdsFilter,
    draftBrandIdsFilter,
    setDraftBrandIdsFilter,
    draftSupplierIdsFilter,
    setDraftSupplierIdsFilter,
    // Actions
    applyFilters,
    applyFiltersWithOverrides,
    clearFilters,
  } = usePODashboardFilter();

  const [supplierSearch, setSupplierSearch] = useState("");

  const {
    options: supplierOptions,
    loading: supplierSearchLoading,
    loadMoreLoading: supplierLoadMoreLoading,
    hasMore: supplierHasMoreOptions,
    search: supplierSearchFn,
    loadMore: supplierLoadMore,
  } = useSupplierOptions("");

  const [storeSearch, setStoreSearch] = useState("");
  const {
    options: storeOptions,
    loading: storeSearchLoading,
    loadMoreLoading: storeLoadMoreLoading,
    hasMore: storeHasMoreOptions,
    search: storeSearchFn,
    loadMore: storeLoadMore,
  } = useStoreOptions("");

  const [storePopoverOpen, setStorePopoverOpen] = useState(false);

  const [brandSearch, setBrandSearch] = useState("");
  const {
    options: brandOptions,
    loading: brandSearchLoading,
    loadMoreLoading: brandLoadMoreLoading,
    hasMore: brandHasMoreOptions,
    search: brandSearchFn,
    loadMore: brandLoadMore,
  } = useBrandOptions("");

  const [brandPopoverOpen, setBrandPopoverOpen] = useState(false);
  const [supplierPopoverOpen, setSupplierPopoverOpen] = useState(false);

  const supplierDisplayOptions = useMemo(
    () => supplierOptions.map((s) => ({ id: s.id, label: s.name })),
    [supplierOptions]
  );

  const storeSearchDebounced = useDebouncedCallback((value: string) => storeSearchFn(value));
  const supplierSearchDebounced = useDebouncedCallback((value: string) => supplierSearchFn(value));
  const brandSearchDebounced = useDebouncedCallback((value: string) => brandSearchFn(value));

  const storeSelectionSet = useMemo(() => new Set(draftStoreIdsFilter), [draftStoreIdsFilter]);
  const brandSelectionSet = useMemo(() => new Set(draftBrandIdsFilter), [draftBrandIdsFilter]);
  const supplierSelectionSet = useMemo(() => new Set(draftSupplierIdsFilter), [draftSupplierIdsFilter]);

  const selectedStoresLabel = useMemo(() => {
    if (draftStoreIdsFilter.length === 0) return "All Stores";
    if (draftStoreIdsFilter.length === 1) {
      const match = storeOptions.find((s) => s.id === draftStoreIdsFilter[0]);
      return match?.name ?? "1 store selected";
    }
    return `${draftStoreIdsFilter.length} stores selected`;
  }, [draftStoreIdsFilter, storeOptions]);

  const selectedBrandsLabel = useMemo(() => {
    if (draftBrandIdsFilter.length === 0) return "All Brands";
    if (draftBrandIdsFilter.length === 1) {
      const match = brandOptions.find((b) => b.id === draftBrandIdsFilter[0]);
      return match?.name ?? "1 brand selected";
    }
    return `${draftBrandIdsFilter.length} brands selected`;
  }, [draftBrandIdsFilter, brandOptions]);

  const selectedSuppliersLabel = useMemo(() => {
    if (draftSupplierIdsFilter.length === 0) return "All Suppliers";
    if (draftSupplierIdsFilter.length === 1) {
      const match = supplierDisplayOptions.find((s) => s.id === draftSupplierIdsFilter[0]);
      return match?.label ?? "1 supplier selected";
    }
    return `${draftSupplierIdsFilter.length} suppliers selected`;
  }, [draftSupplierIdsFilter, supplierDisplayOptions]);

  const handleSupplierListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!supplierHasMoreOptions || supplierLoadMoreLoading || supplierSearchLoading) return;

    const target = event.currentTarget;
    const threshold = 32; // px before bottom to trigger load
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (distanceFromBottom <= threshold) {
      void supplierLoadMore();
    }
  };

  const handleStoreListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!storeHasMoreOptions || storeLoadMoreLoading || storeSearchLoading) return;

    const target = event.currentTarget;
    const threshold = 32; // px before bottom to trigger load
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (distanceFromBottom <= threshold) {
      void storeLoadMore();
    }
  };

  const handleBrandListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!brandHasMoreOptions || brandLoadMoreLoading || brandSearchLoading) return;

    const target = event.currentTarget;
    const threshold = 32; // px before bottom to trigger load
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (distanceFromBottom <= threshold) {
      void brandLoadMore();
    }
  };


  const handleStoreToggle = useCallback((id: number) => {
    setDraftStoreIdsFilter((prev: number[]) => {
      if (prev.includes(id)) {
        return prev.filter((existingId: number) => existingId !== id);
      } else {
        return [...prev, id];
      }
    });
  }, [setDraftStoreIdsFilter]);

  const handleSupplierToggle = useCallback((id: number) => {
    setDraftSupplierIdsFilter((prev: number[]) => {
      if (prev.includes(id)) {
        return prev.filter((existingId: number) => existingId !== id);
      } else {
        return [...prev, id];
      }
    });
  }, [setDraftSupplierIdsFilter]);

  const handleBrandToggle = useCallback((id: number) => {
    setDraftBrandIdsFilter((prev: number[]) => {
      if (prev.includes(id)) {
        return prev.filter((existingId: number) => existingId !== id);
      } else {
        return [...prev, id];
      }
    });
  }, [setDraftBrandIdsFilter]);

  const handleStoreApply = useCallback(() => {
    if (!loading) {
      applyFilters();
      setStorePopoverOpen(false);
    }
  }, [loading, applyFilters, setStorePopoverOpen]);

  const handleStoreClear = useCallback(() => {
    if (!loading) {
      setDraftStoreIdsFilter([]);
      applyFilters();
      setStorePopoverOpen(false);
      setStoreSearch("");
    }
  }, [loading, applyFilters, setDraftStoreIdsFilter, setStorePopoverOpen, setStoreSearch]);

  const handleBrandApply = useCallback(() => {
    if (!loading) {
      applyFilters();
      setBrandPopoverOpen(false);
    }
  }, [loading, applyFilters, setBrandPopoverOpen]);

  const handleBrandClear = useCallback(() => {
    if (!loading) {
      setDraftBrandIdsFilter([]);
      applyFilters();
      setBrandPopoverOpen(false);
      setBrandSearch("");
    }
  }, [loading, applyFilters, setDraftBrandIdsFilter, setBrandPopoverOpen, setBrandSearch]);

  const handleSupplierApply = useCallback(() => {
    if (!loading) {
      applyFilters();
      setSupplierPopoverOpen(false);
    }
  }, [loading, applyFilters, setSupplierPopoverOpen]);

  const handleSupplierClear = useCallback(() => {
    if (!loading) {
      setDraftSupplierIdsFilter([]);
      applyFilters();
      setSupplierPopoverOpen(false);
      setSupplierSearch("");
    }
  }, [loading, applyFilters, setDraftSupplierIdsFilter, setSupplierPopoverOpen, setSupplierSearch]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end sm:gap-x-3 sm:gap-y-3">
      <div className="flex flex-col gap-1 w-full sm:w-auto">
        <Label htmlFor="po-type-select" className="text-xs font-medium uppercase text-muted-foreground">PO Type</Label>
        <Select
          value={draftPOTypeFilter}
          onValueChange={(value: "ALL" | "AU" | "PO" | "OTHERS") => {
            if (!loading) {
              setDraftPOTypeFilter(value);
              applyFiltersWithOverrides({ poType: value });
            }
          }}
          disabled={loading}
        >
          <SelectTrigger id="po-type-select" className="w-full sm:w-40 h-10 bg-background border-border rounded-lg">
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
      <div className="flex flex-col gap-1 w-full sm:w-auto">
        <Label className="text-xs font-medium uppercase text-muted-foreground">PO Released Date</Label>
        <div className={loading ? "pointer-events-none opacity-60 w-full" : "w-full"}>
          <DatePicker
            value={draftReleasedDateFilter || undefined}
            onChange={(value) => {
              if (!loading) {
                const dateValue = (value as string) || "";
                setDraftReleasedDateFilter(dateValue);
                applyFiltersWithOverrides({ releasedDate: dateValue });
              }
            }}
            placeholder="All Dates"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1 w-full sm:w-auto">
        <Label htmlFor="store-popover-trigger" className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1.5">
          <StoreIcon className="h-3 w-3 text-primary/70" /> Store
        </Label>
        <Popover open={storePopoverOpen} onOpenChange={setStorePopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              id="store-popover-trigger"
              variant="outline"
              className="w-full sm:w-52 justify-between h-10 px-3 bg-background border-border rounded-lg font-normal"
              disabled={loading}
            >
              <span className="truncate text-left text-sm">{selectedStoresLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="end">
            <Command shouldFilter={false}>
              <CommandInput
                id="store-search"
                name="store-search"
                placeholder="Search store..."
                value={storeSearch}
                onValueChange={(value) => {
                  setStoreSearch(value);
                  storeSearchDebounced(value);
                }}
              />
              <CommandList className="max-h-64 overflow-auto" onScroll={handleStoreListScroll}>
                {storeSearchLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Loading stores...
                  </div>
                ) : (
                  <>
                    <CommandEmpty>No store found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          const allIds = storeOptions.map(opt => opt.id);
                          setDraftStoreIdsFilter(allIds);
                        }}
                      >
                        <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all ${
                          draftStoreIdsFilter.length === storeOptions.length && storeOptions.length > 0
                            ? "bg-primary text-primary-foreground"
                            : "opacity-50 [&_svg]:invisible"
                        }`}>
                          <Check className="h-3 w-3" />
                        </div>
                        <span className="font-medium">Select All</span>
                      </CommandItem>
                      {storeOptions.map((opt) => (
                        <FilterCheckboxItem
                          key={opt.id}
                          id={opt.id}
                          name={opt.name}
                          isSelected={storeSelectionSet.has(opt.id)}
                          onToggle={handleStoreToggle}
                        />
                      ))}
                    </CommandGroup>
                    <div className="flex gap-1 p-2 border-t sticky bottom-0 bg-popover">
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStoreApply();
                        }}
                        disabled={loading}
                      >
                        Apply
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStoreClear();
                        }}
                        disabled={loading}
                      >
                        Clear
                      </Button>
                    </div>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-col gap-1 w-full sm:w-auto">
        <Label htmlFor="supplier-popover-trigger" className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1.5">
          <Tag className="h-3 w-3 text-primary/70" /> Supplier
        </Label>
        <Popover open={supplierPopoverOpen} onOpenChange={setSupplierPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              id="supplier-popover-trigger"
              variant="outline"
              className="w-full sm:w-52 justify-between h-10 px-3 bg-background border-border rounded-lg font-normal"
              disabled={loading || supplierSearchLoading}
            >
              <span className="truncate text-left text-sm">{selectedSuppliersLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="end">
            <Command shouldFilter={false}>
              <CommandInput
                id="supplier-search"
                name="supplier-search"
                placeholder="Search supplier..."
                value={supplierSearch}
                onValueChange={(value) => {
                  setSupplierSearch(value);
                  supplierSearchDebounced(value);
                }}
              />
              <CommandList className="max-h-64 overflow-auto" onScroll={handleSupplierListScroll}>
                <CommandEmpty>No supplier found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      const allIds = supplierDisplayOptions.map(opt => opt.id);
                      setDraftSupplierIdsFilter(allIds);
                    }}
                  >
                    <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all ${
                      draftSupplierIdsFilter.length === supplierDisplayOptions.length && supplierDisplayOptions.length > 0
                        ? "bg-primary text-primary-foreground"
                        : "opacity-50 [&_svg]:invisible"
                    }`}>
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="font-medium">Select All</span>
                  </CommandItem>
                  {supplierDisplayOptions.map((opt) => (
                    <FilterCheckboxItem
                      key={opt.id}
                      id={opt.id}
                      name={opt.label}
                      isSelected={supplierSelectionSet.has(opt.id)}
                      onToggle={handleSupplierToggle}
                    />
                  ))}
                </CommandGroup>
                <div className="flex gap-1 p-2 border-t sticky bottom-0 bg-popover">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSupplierApply();
                    }}
                    disabled={loading}
                  >
                    Apply
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSupplierClear();
                    }}
                    disabled={loading}
                  >
                    Clear
                  </Button>
                </div>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-col gap-1 w-full sm:w-auto">
        <Label htmlFor="brand-popover-trigger" className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1.5">
          <Tag className="h-3 w-3 text-primary/70" /> Brand
        </Label>
        <Popover open={brandPopoverOpen} onOpenChange={setBrandPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              id="brand-popover-trigger"
              variant="outline"
              className="w-full sm:w-52 justify-between h-10 px-3 bg-background border-border rounded-lg font-normal"
              disabled={loading}
            >
              <span className="truncate text-left text-sm">{selectedBrandsLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="end">
            <Command shouldFilter={false}>
              <CommandInput
                id="brand-search"
                name="brand-search"
                placeholder="Search brand..."
                value={brandSearch}
                onValueChange={(value) => {
                  setBrandSearch(value);
                  brandSearchDebounced(value);
                }}
              />
              <CommandList className="max-h-64 overflow-auto" onScroll={handleBrandListScroll}>
                {brandSearchLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Loading brands...
                  </div>
                ) : (
                  <>
                    <CommandEmpty>No brand found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          const allIds = brandOptions.map(opt => opt.id);
                          setDraftBrandIdsFilter(allIds);
                        }}
                      >
                        <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all ${
                          draftBrandIdsFilter.length === brandOptions.length && brandOptions.length > 0
                            ? "bg-primary text-primary-foreground"
                            : "opacity-50 [&_svg]:invisible"
                        }`}>
                          <Check className="h-3 w-3" />
                        </div>
                        <span className="font-medium">Select All</span>
                      </CommandItem>
                      {brandOptions.map((opt) => (
                        <FilterCheckboxItem
                          key={opt.id}
                          id={opt.id}
                          name={opt.name}
                          isSelected={brandSelectionSet.has(opt.id)}
                          onToggle={handleBrandToggle}
                        />
                      ))}
                    </CommandGroup>
                    <div className="flex gap-1 p-2 border-t sticky bottom-0 bg-popover">
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBrandApply();
                        }}
                        disabled={loading}
                      >
                        Apply
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBrandClear();
                        }}
                        disabled={loading}
                      >
                        Clear
                      </Button>
                    </div>
                  </>
                )}
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
          onClick={() => {
            if (!loading) {
              clearFilters();
            }
          }}
          disabled={loading}
        >
          Clear all filters
        </Button>
      </div>
    </div>
  );
};
