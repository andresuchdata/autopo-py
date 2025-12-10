import { useCallback, useEffect, useRef, useState } from 'react';
import { poService } from '@/services/api';

export interface SupplierOption {
  id: number;
  name: string;
}

const SUPPLIER_PAGE_SIZE = 50;

type FetchOptions = {
  searchValue: string;
  append: boolean;
};

const normalizeSupplierOptions = (items: Array<Record<string, any>> = []): SupplierOption[] => {
  const dedup = new Map<number, string>();

  items.forEach((item) => {
    const id = typeof item.id === 'number' ? item.id : Number(item.id);
    if (!id || Number.isNaN(id)) return;

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const label = name || `Supplier #${id}`;

    if (!dedup.has(id)) {
      dedup.set(id, label);
    }
  });

  return Array.from(dedup.entries()).map(([id, name]) => ({ id, name }));
};

export function useSupplierOptions(initialSearch = '') {
  const [options, setOptions] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState(initialSearch);

  const optionsRef = useRef<SupplierOption[]>([]);
  const optionLookupRef = useRef<Map<number, SupplierOption>>(new Map());

  const fetchOptions = useCallback(
    async ({ searchValue, append }: FetchOptions) => {
      if (append) {
        setLoadMoreLoading(true);
      } else {
        setLoading(true);
      }

      try {
        const limit = SUPPLIER_PAGE_SIZE;
        const offset = append ? optionsRef.current.length : 0;
        const response = await poService.getSuppliers({
          search: searchValue || undefined,
          limit,
          offset,
        });

        const rawItems = Array.isArray(response)
          ? response
          : Array.isArray((response as any)?.data)
            ? (response as any).data
            : [];

        const normalized = normalizeSupplierOptions(rawItems);

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

        setHasMore(normalized.length === limit);
      } catch (err) {
        setHasMore(false);
        console.error('Failed to fetch supplier options:', err);
      } finally {
        if (append) {
          setLoadMoreLoading(false);
        } else {
          setLoading(false);
        }
      }
    },
    []
  );

  const search = useCallback(async (searchValue = '') => {
    setSearchTerm(searchValue);
    setHasMore(true);
    await fetchOptions({ searchValue, append: false });
  }, [fetchOptions]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadMoreLoading || loading) {
      return;
    }

    await fetchOptions({ searchValue: searchTerm, append: true });
  }, [fetchOptions, hasMore, loadMoreLoading, loading, searchTerm]);

  useEffect(() => {
    search(initialSearch).catch((err) => {
      console.error('Initial supplier fetch failed:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveOption = useCallback((id: number) => optionLookupRef.current.get(id), []);

  return {
    options,
    loading,
    loadMoreLoading,
    hasMore,
    searchTerm,
    search,
    loadMore,
    resolveOption,
  };
}
