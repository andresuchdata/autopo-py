export type FilterOption<T extends string | number = string | number> = {
    id: T;
    label: string;
    name?: string;
};

export type GenericFilterConfig<T extends string | number> = {
    mode: 'single' | 'multi';
    options: FilterOption<T>[];
    selected: T | T[] | null;
    onChange: (value: T | T[] | null) => void;
    placeholder: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    // Advanced features
    searchable?: boolean;
    onSearch?: (query: string) => void;
    onLoadMore?: () => void;
    hasMore?: boolean;
    isLoading?: boolean;
    isLoadingMore?: boolean;
    resolveOption?: (id: T) => FilterOption<T> | undefined;
    showPinnedSelected?: boolean;
    pinnedHeading?: string;
    width?: string;
    minHeight?: string;
    maxInlineSelected?: number;
    triggerClassName?: string;
};
