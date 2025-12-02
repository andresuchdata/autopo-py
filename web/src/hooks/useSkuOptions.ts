import { useCallback, useEffect, useRef, useState } from 'react';
import { poService } from '@/services/api';

export interface SkuOption {
  code: string;
  label: string;
  name?: string;
}

const SKU_PAGE_SIZE = 50;

type FetchOptions = {
  searchValue: string;
  append: boolean;
};

const normalizeSkuOptions = (items: Array<Record<string, unknown>> = []): SkuOption[] => {
  const dedup = new Map<string, { label: string; name?: string }>();

  items.forEach((item) => {
    const rawCode =
      (typeof item.sku_code === 'string' && item.sku_code.trim()) ||
      (typeof item.sku === 'string' && item.sku.trim()) ||
      '';

    if (!rawCode) {
      return;
    }

    const name =
      (typeof item.name === 'string' && item.name.trim()) ||
      (typeof item.product_name === 'string' && item.product_name.trim()) ||
      '';

    const trimmedName = name || undefined;
    const label = trimmedName ? `${rawCode} - ${trimmedName}` : rawCode;

    if (!dedup.has(rawCode)) {
      dedup.set(rawCode, { label, name: trimmedName });
    }
  });

  return Array.from(dedup.entries()).map(([code, data]) => ({ code, label: data.label, name: data.name }));
};

export function useSkuOptions(initialSearch = '') {
  const [options, setOptions] = useState<SkuOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState(initialSearch);

  const optionsRef = useRef<SkuOption[]>([]);
  const optionLookupRef = useRef<Map<string, SkuOption>>(new Map());

  const fetchOptions = useCallback(
    async ({ searchValue, append }: FetchOptions) => {
      if (append) {
        setLoadMoreLoading(true);
      } else {
        setLoading(true);
      }

      try {
        const limit = SKU_PAGE_SIZE;
        const offset = append ? optionsRef.current.length : 0;
        const response = await poService.getSkus({
          search: searchValue || undefined,
          limit,
          offset,
        });

        const rawItems = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
            ? response.data
            : [];

        const normalized = normalizeSkuOptions(rawItems);

        setOptions((prev) => {
          const base = append ? [...prev] : [];
          const seen = new Set(base.map((option) => option.code));

          normalized.forEach((option) => {
            optionLookupRef.current.set(option.code, option);
            if (!seen.has(option.code)) {
              base.push(option);
              seen.add(option.code);
            }
          });

          optionsRef.current = base;
          return base;
        });

        setHasMore(normalized.length === limit);
      } catch (err) {
        setHasMore(false);
        console.error('Failed to fetch SKU options:', err);
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

  const search = useCallback(
    async (searchValue = '') => {
      setSearchTerm(searchValue);
      setHasMore(true);
      await fetchOptions({ searchValue, append: false });
    },
    [fetchOptions]
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loadMoreLoading || loading) {
      return;
    }
    await fetchOptions({ searchValue: searchTerm, append: true });
  }, [fetchOptions, hasMore, loadMoreLoading, loading, searchTerm]);

  useEffect(() => {
    search(initialSearch).catch((err) => {
      console.error('Initial SKU fetch failed:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveOption = useCallback((code: string) => optionLookupRef.current.get(code), []);

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
