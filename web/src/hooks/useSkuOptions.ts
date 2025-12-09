import { useCallback, useEffect, useRef, useState } from 'react';
import { poService } from '@/services/api';

export interface SkuOption {
  code: string;
  label: string;
  name?: string;
  brandId?: number | null;
}

const SKU_PAGE_SIZE = 50;

type FetchOptions = {
  searchValue: string;
  append: boolean;
  brandIds?: number[];
};

const normalizeSkuOptions = (items: Array<Record<string, unknown>> = []): SkuOption[] => {
  const dedup = new Map<string, { label: string; name?: string; brandId?: number | null }>();

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

    const rawBrandId =
      typeof (item as any).brand_id === 'number'
        ? (item as any).brand_id
        : typeof (item as any).brandId === 'number'
          ? (item as any).brandId
          : null;

    if (!dedup.has(rawCode)) {
      dedup.set(rawCode, { label, name: trimmedName, brandId: rawBrandId });
    } else {
      const existing = dedup.get(rawCode)!;
      if ((existing.brandId == null || existing.brandId === 0) && rawBrandId) {
        existing.brandId = rawBrandId;
      }
    }
  });

  return Array.from(dedup.entries()).map(([code, data]) => ({
    code,
    label: data.label,
    name: data.name,
    brandId: data.brandId ?? null,
  }));
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
    async ({ searchValue, append, brandIds }: FetchOptions) => {
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
          brandIds,
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

          // Clear lookup when starting fresh
          if (!append) {
            optionLookupRef.current.clear();
          }

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
    async (searchValue = '', brandIds?: number[]) => {
      setSearchTerm(searchValue);
      setHasMore(true);
      await fetchOptions({ searchValue, append: false, brandIds });
    },
    [fetchOptions]
  );

  const loadMore = useCallback(async (brandIds?: number[]) => {
    if (!hasMore || loadMoreLoading || loading) {
      return;
    }

    await fetchOptions({ searchValue: searchTerm, append: true, brandIds });
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
