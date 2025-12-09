// In useDashboard.ts
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useStockData, type LabeledOption } from './useStockData';
import { stockHealthService } from '@/services/stockHealthService';
import { poService } from '@/services/api';
import { useSkuOptions, type SkuOption } from './useSkuOptions';

export interface DashboardFiltersState {
  brandIds: number[];
  storeIds: number[];
  skuCodes: string[];
}

const DEFAULT_FILTERS: DashboardFiltersState = { brandIds: [], storeIds: [], skuCodes: [] };
const DEFAULT_STORE_NAME = 'miss glam padang';

export function useDashboard() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filters, setFilters] = useState<DashboardFiltersState>(DEFAULT_FILTERS);
  const [masterBrandOptions, setMasterBrandOptions] = useState<LabeledOption[]>([]);
  const [masterStoreOptions, setMasterStoreOptions] = useState<LabeledOption[]>([]);
  const filtersChangedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    data,
    loading,
    error,
    refresh,
    lastUpdated,
    availableDates,
    fetchItems,
    getBrandOptions,
    getStoreOptions,
  } = useStockData();

  const derivedBrandOptions = useMemo(() => getBrandOptions(), [getBrandOptions]);
  const derivedStoreOptions = useMemo(() => getStoreOptions(), [getStoreOptions]);

  const {
    options: skuOptions,
    loading: skuSearchLoading,
    loadMoreLoading: skuLoadMoreLoading,
    hasMore: skuHasMoreOptions,
    search: handleSkuSearch,
    loadMore: handleSkuLoadMore,
    resolveOption: resolveSkuOption,
  } = useSkuOptions();

  const brandOptions = useMemo(() => {
    return masterBrandOptions.length > 0 ? masterBrandOptions : derivedBrandOptions;
  }, [derivedBrandOptions, masterBrandOptions]);

  const storeOptions = useMemo(() => {
    return masterStoreOptions.length > 0 ? masterStoreOptions : derivedStoreOptions;
  }, [derivedStoreOptions, masterStoreOptions]);

  const mapToOptions = useCallback((items: Array<Record<string, unknown>> = []): LabeledOption[] =>
    items
      .map((item, index) => {
        const possibleId =
          item.id ??
          item.ID ??
          item.original_id ??
          item.originalId ??
          item.brand_id ??
          item.store_id ??
          index;

        const coercedId =
          typeof possibleId === 'number'
            ? possibleId
            : typeof possibleId === 'string' && possibleId.trim() !== ''
              ? Number(possibleId)
              : null;

        const possibleName =
          item.name ??
          item.Name ??
          item.brand ??
          item.Brand ??
          item.store ??
          item.Store ??
          item.nama ??
          `Entry ${index + 1}`;

        const name = typeof possibleName === 'string' ? possibleName : String(possibleName ?? `Entry ${index + 1}`);

        return { id: Number.isNaN(coercedId ?? undefined) ? null : coercedId, name };
      })
      .filter((option) => option.name.trim().length > 0), []);

  const findDefaultStore = useCallback(
    (options: LabeledOption[]) =>
      options.find((option) => option.id !== null && option.name.trim().toLowerCase() === DEFAULT_STORE_NAME),
    []
  );

  const ensureDefaultStoreSelection = useCallback(async (): Promise<DashboardFiltersState> => {
    if (filters.storeIds.length) {
      return filters;
    }

    const existingStore = findDefaultStore(storeOptions);
    if (existingStore?.id != null) {
      const nextFilters = { ...filters, storeIds: [existingStore.id] };
      setFilters(nextFilters);
      return nextFilters;
    }

    try {
      const storesRes = await poService.getStores('Miss Glam Padang');
      const normalized = mapToOptions(storesRes ?? []);
      const fetchedStore = findDefaultStore(normalized);
      if (fetchedStore?.id != null) {
        const nextFilters = { ...filters, storeIds: [fetchedStore.id] };
        setFilters(nextFilters);
        return nextFilters;
      }
    } catch (err) {
      console.error('Failed to fetch default store for dashboard filters:', err);
    }

    return filters;
  }, [filters, findDefaultStore, mapToOptions, storeOptions]);

  useEffect(() => {
    let isMounted = true;

    const fetchMasterData = async () => {
      try {
        const [brandsRes, storesRes] = await Promise.all([poService.getBrands(), poService.getStores()]);

        if (!isMounted) return;

        const brandOpts = mapToOptions(brandsRes ?? []);
        const storeOpts = mapToOptions(storesRes ?? []);

        if (brandOpts.length > 0) {
          setMasterBrandOptions(brandOpts);
        }
        if (storeOpts.length > 0) {
          setMasterStoreOptions(storeOpts);
        }
      } catch (err) {
        console.error('Failed to fetch master data for dashboard filters:', err);
      }
    };

    fetchMasterData();

    return () => {
      isMounted = false;
    };
  }, [mapToOptions]);

  const loadInitialData = useCallback(async () => {
    try {
      const { latestDate } = await stockHealthService.getAvailableDatesWithLatest();

      const initialFilters = await ensureDefaultStoreSelection();

      if (latestDate) {
        setSelectedDate(latestDate);
        await refresh(latestDate, initialFilters);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  }, [ensureDefaultStoreSelection, refresh]);

  useEffect(() => {
    if (!selectedDate) {
      loadInitialData();
    }
  }, [selectedDate, loadInitialData]);

  const handleDateChange = useCallback(async (newDate: string) => {
    setSelectedDate(newDate);
    await refresh(newDate, filters);
  }, [filters, refresh]);

  const handleFilterChange = useCallback(async (nextFilters: DashboardFiltersState) => {
    filtersChangedRef.current = true;
    setFilters(nextFilters);
  }, []);

  useEffect(() => {
    handleSkuSearch('', filters.brandIds).catch((err) => {
      console.error('Failed to refresh SKU options after brand change:', err);
    });
  }, [filters.brandIds, handleSkuSearch]);

  const handleSkuSearchWithBrand = useCallback(
    (search?: string) => handleSkuSearch(search ?? '', filters.brandIds),
    [handleSkuSearch, filters.brandIds]
  );

  const handleSkuLoadMoreWithBrand = useCallback(
    () => handleSkuLoadMore(filters.brandIds),
    [handleSkuLoadMore, filters.brandIds]
  );

  useEffect(() => {
    if (!selectedDate || !filtersChangedRef.current) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      refresh(selectedDate, filters).catch((err) => {
        console.error('Failed to refresh dashboard after filter change:', err);
      });
      filtersChangedRef.current = false;
    }, 700);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filters, selectedDate, refresh]);

  const refreshSelected = useCallback(() => {
    if (!selectedDate) return Promise.resolve(null);
    return refresh(selectedDate, filters);
  }, [filters, refresh, selectedDate]);

  return {
    data,
    loading,
    error,
    selectedDate,
    lastUpdated,
    filters,
    brandOptions,
    storeOptions,
    skuOptions,
    availableDates,
    onDateChange: handleDateChange,
    onFiltersChange: handleFilterChange,
    refresh: refreshSelected,
    fetchItems,
    brandList: brandOptions,
    storeList: storeOptions,
    onSkuSearch: handleSkuSearchWithBrand,
    skuSearchLoading,
    onSkuLoadMore: handleSkuLoadMoreWithBrand,
    skuHasMoreOptions,
    skuLoadMoreLoading,
    resolveSkuOption,
  };
}