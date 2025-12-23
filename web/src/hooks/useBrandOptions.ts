import { useCallback, useEffect, useRef, useState } from 'react';
import { poService } from '@/services/api';

export interface BrandOption {
  id: number;
  name: string;
}

const BRAND_PAGE_SIZE = 50;

type FetchOptions = {
  searchValue: string;
  append: boolean;
};

const normalizeBrandOptions = (items: Array<Record<string, any>> = []): BrandOption[] => {
  const dedup = new Map<number, string>();

  items.forEach((item) => {
    const id = typeof item.id === 'number' ? item.id : Number(item.id);
    if (!id || Number.isNaN(id)) return;

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const label = name || `Brand #${id}`;

    if (!dedup.has(id)) {
      dedup.set(id, label);
    }
  });

  return Array.from(dedup.entries()).map(([id, name]) => ({ id, name }));
};

export function useBrandOptions(initialSearch = '') {
  const [options, setOptions] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false); // Always false since we load all at once
  const [searchTerm, setSearchTerm] = useState(initialSearch);

  const optionsRef = useRef<BrandOption[]>([]);
  const optionLookupRef = useRef<Map<number, BrandOption>>(new Map());

  const fetchOptions = useCallback(
    async ({ searchValue, append }: { searchValue: string; append: boolean }) => {
      if (!append) {
        setLoading(true);
      }

      try {
        // Load all brands since API doesn't support pagination
        const response = await poService.getBrands(searchValue || undefined);

        const rawItems = Array.isArray(response)
          ? response
          : Array.isArray((response as any)?.data)
            ? (response as any).data
            : [];

        const normalized = normalizeBrandOptions(rawItems);

        setOptions((prev) => {
          const base = append ? [...prev] : [];
          const seen = new Set(base.map((option) => option.id));

          if (!append) {
            optionLookupRef.current.clear();
          }

          normalized.forEach((option) => {
            optionLookupRef.current.set(option.id, option);
            if (!seen.has(option.id)) {
              base.push(option);
              seen.add(option.id);
            }
          });

          optionsRef.current = base;
          return base;
        });

        setHasMore(false); // No more since we loaded all
      } catch (err) {
        setHasMore(false);
        console.error('Failed to fetch brand options:', err);
      } finally {
        if (!append) {
          setLoading(false);
        }
      }
    },
    []
  );

  const search = useCallback(async (searchValue = '') => {
    setSearchTerm(searchValue);
    await fetchOptions({ searchValue, append: false });
  }, [fetchOptions]);

  const loadMore = useCallback(async () => {
    // No-op since we load all at once
  }, []);

  useEffect(() => {
    search(initialSearch).catch((err) => {
      console.error('Initial brand fetch failed:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveOption = useCallback((id: number) => optionLookupRef.current.get(id), []);

  return {
    options,
    loading,
    loadMoreLoading: false, // Always false
    hasMore: false, // Always false
    searchTerm,
    search,
    loadMore,
    resolveOption,
  };
}
