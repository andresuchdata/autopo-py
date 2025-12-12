import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, X, Store as StoreIcon, Calendar, Tag, Barcode, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { type DashboardFiltersState } from "@/hooks/useDashboard";
import { type SkuOption } from "@/hooks/useSkuOptions";
import { type LabeledOption } from "@/hooks/useStockData";

interface DashboardFiltersProps {
    filters: DashboardFiltersState;
    onFilterChange: (filters: DashboardFiltersState) => void;
    brandOptions: LabeledOption[];
    kategoriBrandOptions: string[];
    storeOptions: LabeledOption[];
    selectedDate: string | null;
    availableDates: string[];
    onDateChange: (date: string) => void;
    skuOptions: SkuOption[];
    onSkuSearch: (search?: string) => void;
    skuSearchLoading: boolean;
    onSkuLoadMore: () => void;
    skuHasMoreOptions: boolean;
    skuLoadMoreLoading: boolean;
    resolveSkuOption: (code: string) => SkuOption | undefined;
}

// Generic filter option types
type FilterOption<T extends string | number = string | number> = {
    id: T;
    label: string;
    name?: string;
};

type GenericFilterConfig<T extends string | number> = {
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
};

function GenericFilter<T extends string | number>({
    mode,
    options = [],
    selected,
    onChange,
    placeholder,
    searchPlaceholder = "Search...",
    emptyMessage = "No items found.",
    searchable = true,
    onSearch,
    onLoadMore,
    hasMore = false,
    isLoading = false,
    isLoadingMore = false,
    resolveOption,
    showPinnedSelected = false,
    pinnedHeading = "Selected Items",
    width = "w-[280px]",
    minHeight,
    maxInlineSelected = 2,
}: GenericFilterConfig<T>) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const listRef = useRef<HTMLDivElement | null>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const DEFAULT_RENDER_BATCH = 200;
    const [visibleCount, setVisibleCount] = useState(DEFAULT_RENDER_BATCH);

    const selectedArray = useMemo(() => {
        if (selected === null) return [];
        return Array.isArray(selected) ? selected : [selected];
    }, [selected]);

    const handleSearchChange = (value: string) => {
        setSearch(value);
        setVisibleCount(DEFAULT_RENDER_BATCH);

        if (!onSearch) {
            return;
        }

        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }

        searchDebounceRef.current = setTimeout(() => {
            onSearch(value);
        }, 250);
    };

    useEffect(() => {
        if (!open) {
            return;
        }

        // Reset progressive rendering each time popover opens.
        setVisibleCount(DEFAULT_RENDER_BATCH);
    }, [open]);

    const optionMap = useMemo(() => {
        const map = new Map<T, FilterOption<T>>();
        options.forEach((option) => {
            map.set(option.id, option);
        });
        return map;
    }, [options]);

    const selectedLabels = useMemo(
        () =>
            selectedArray.map((id) => {
                const option = optionMap.get(id) ?? resolveOption?.(id);
                return option?.label ?? String(id);
            }),
        [optionMap, resolveOption, selectedArray]
    );

    const pinnedOptions = useMemo(() => {
        if (!showPinnedSelected) return [];
        return selectedArray.map((id) => {
            const option = optionMap.get(id) ?? resolveOption?.(id);
            const baseLabel = option?.label ?? String(id);
            const explicitName = option?.name;
            const derivedName = !explicitName && baseLabel.includes(" - ") ? baseLabel.split(" - ", 2)[1] : undefined;
            const name = explicitName ?? derivedName;
            return {
                id,
                label: baseLabel,
                name,
            };
        });
    }, [optionMap, resolveOption, selectedArray, showPinnedSelected]);

    const availableOptions = useMemo(() => {
        return options.filter((option) => !selectedArray.includes(option.id));
    }, [options, selectedArray]);

    const handleSelect = (id: T) => {
        if (mode === 'single') {
            onChange(id);
            setOpen(false);
        } else {
            const newSelected = selectedArray.includes(id)
                ? selectedArray.filter((value) => value !== id)
                : [...selectedArray, id];
            onChange(newSelected);
        }
    };

    const handleClear = () => {
        onChange(null);
        if (mode === 'single') {
            setOpen(false);
        }
    };

    const handleListScroll = useCallback(
        (event: React.UIEvent<HTMLDivElement>) => {
            const target = event.currentTarget;
            const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

            // Progressive rendering to avoid mapping huge option arrays at once.
            if (distanceToBottom < 200) {
                setVisibleCount((current) => Math.min(current + DEFAULT_RENDER_BATCH, availableOptions.length));
            }

            if (!hasMore || isLoading || isLoadingMore || !onLoadMore) {
                return;
            }
            if (distanceToBottom < 48) {
                onLoadMore();
            }
        },
        [DEFAULT_RENDER_BATCH, availableOptions.length, hasMore, isLoading, isLoadingMore, onLoadMore]
    );

    const renderTriggerContent = () => {
        if (mode === 'single') {
            const selectedLabel = selectedArray.length > 0 ? selectedLabels[0] : null;
            return (
                <span className={cn(selectedLabel === null && "text-muted-foreground")}>
                    {selectedLabel ?? placeholder}
                </span>
            );
        }

        return (
            <div className="flex flex-wrap gap-1 items-center flex-1 min-w-0 text-left">
                {selectedArray.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
                {selectedArray.length > 0 && selectedArray.length <= maxInlineSelected && (
                    selectedLabels.map((label, idx) => (
                        <span
                            key={`${label}-${idx}`}
                            className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors border-border bg-secondary/80 text-secondary-foreground hover:bg-secondary mr-1 mb-0.5 max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                        >
                            {label}
                            <span
                                className="ml-1 cursor-pointer opacity-70 hover:opacity-100"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const id = selectedArray[idx];
                                    handleSelect(id);
                                }}
                            >
                                <X className="h-3 w-3" />
                            </span>
                        </span>
                    ))
                )}
                {selectedArray.length > 2 && (
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold border-border bg-secondary/80 text-secondary-foreground hover:bg-secondary mr-1">
                        {selectedArray.length} selected
                    </span>
                )}
            </div>
        );
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal h-auto min-h-12 py-2 px-3 bg-background border-border hover:bg-muted/50 transition-colors rounded-lg shadow-sm">
                    {renderTriggerContent()}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className={cn(width, "p-0 shadow-xl border-border/60", minHeight)} align="start">
                <Command shouldFilter={!onSearch} className="rounded-lg border-none">
                    {searchable && (
                        <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={handleSearchChange} />
                    )}
                    <CommandList ref={listRef} onScroll={handleListScroll} className="max-h-[300px] overflow-y-auto custom-scrollbar">
                        <CommandEmpty>{emptyMessage}</CommandEmpty>
                        <CommandGroup>
                            <CommandItem onSelect={handleClear} className="justify-center text-center font-medium text-sm text-muted-foreground hover:text-foreground">
                                Clear selection
                            </CommandItem>
                        </CommandGroup>
                        {pinnedOptions.length > 0 && (
                            <CommandGroup heading={pinnedHeading} className="text-primary font-medium">
                                {pinnedOptions.map((option) => (
                                    <CommandItem key={`pinned-${String(option.id)}`} onSelect={() => handleSelect(option.id)} className="aria-selected:bg-primary/10">
                                        <div
                                            className={cn(
                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all",
                                                selectedArray.includes(option.id)
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50 [&_svg]:invisible"
                                            )}
                                        >
                                            <Check className={cn("h-3 w-3")} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-sm leading-none mb-1">{String(option.id)}</span>
                                            {option.name && <span className="text-xs text-muted-foreground line-clamp-1">{option.name}</span>}
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                        {isLoading && (
                            <CommandGroup>
                                <CommandItem disabled className="justify-center text-muted-foreground text-sm py-4">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
                                    Searching...
                                </CommandItem>
                            </CommandGroup>
                        )}
                        <CommandGroup className="text-muted-foreground">
                            {availableOptions.slice(0, visibleCount).map((option) => {
                                const isSelected = selectedArray.includes(option.id);
                                return (
                                    <CommandItem key={String(option.id)} onSelect={() => handleSelect(option.id)}>
                                        <div
                                            className={cn(
                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50 [&_svg]:invisible"
                                            )}
                                        >
                                            <Check className={cn("h-3 w-3")} />
                                        </div>
                                        {option.label}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        {hasMore && !isLoading && onLoadMore && (
                            <CommandGroup className="border-t border-border/50">
                                <CommandItem disabled={isLoadingMore} onSelect={onLoadMore} className="justify-center text-sm text-primary font-medium cursor-pointer hover:bg-primary/5 py-3">
                                    {isLoadingMore ? (
                                        <span className="flex items-center gap-2"><div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />Loading more...</span>
                                    ) : "Load more results"}
                                </CommandItem>
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function DashboardFilters({
    filters,
    onFilterChange,
    brandOptions,
    kategoriBrandOptions,
    storeOptions,
    selectedDate,
    availableDates,
    onDateChange,
    skuOptions,
    onSkuSearch,
    skuSearchLoading,
    onSkuLoadMore,
    skuHasMoreOptions,
    skuLoadMoreLoading,
    resolveSkuOption,
}: DashboardFiltersProps) {
    // Convert LabeledOption to FilterOption format
    const storeFilterOptions = useMemo<FilterOption<number>[]>(
        () => storeOptions
            .filter((opt) => opt.id !== null)
            .map((opt) => ({ id: opt.id!, label: opt.name, name: opt.name })),
        [storeOptions]
    );

    const brandFilterOptions = useMemo<FilterOption<number>[]>(
        () => brandOptions
            .filter((opt) => opt.id !== null)
            .map((opt) => ({ id: opt.id!, label: opt.name, name: opt.name })),
        [brandOptions]
    );

    const kategoriBrandFilterOptions = useMemo<FilterOption<string>[]>(
        () => kategoriBrandOptions.map((name) => ({ id: name, label: name, name })),
        [kategoriBrandOptions]
    );

    // Convert SkuOption to FilterOption format
    const skuFilterOptions = useMemo<FilterOption<string>[]>(
        () => skuOptions.map((opt) => ({ id: opt.code, label: opt.label, name: opt.name })),
        [skuOptions]
    );

    const selectedStoreId = filters.storeIds[0] ?? null;

    return (
        <div className="flex flex-col xl:flex-row gap-5 mb-8 bg-card/50 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-border/50 transition-colors">
            <div className="flex items-start gap-3 text-muted-foreground border-r border-border/50 pr-5 hidden xl:flex">
                <div className="p-2 bg-muted rounded-lg">
                    <Filter size={20} />
                </div>
                <div className="text-sm font-medium mt-1.5">
                    Filters
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
                <div className="flex flex-col gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <StoreIcon size={14} className="text-primary/70" /> Store
                    </Label>
                    <GenericFilter<number>
                        mode="single"
                        options={storeFilterOptions}
                        selected={selectedStoreId}
                        onChange={(value) => {
                            const id = value as number | null;
                            onFilterChange({ ...filters, storeIds: id !== null ? [id] : [] });
                        }}
                        placeholder="All Stores"
                        searchPlaceholder="Search store..."
                        emptyMessage="No store found."
                        minHeight="min-h-[200px]"
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar size={14} className="text-primary/70" /> Date (Snapshot)
                    </Label>
                    <Select value={selectedDate || ""} onValueChange={onDateChange}>
                        <SelectTrigger className="w-full h-auto min-h-12 py-2 px-3 bg-background border-border hover:bg-muted/50 transition-colors rounded-lg shadow-sm">
                            <SelectValue placeholder="Latest Snapshot" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                            {availableDates.length > 0 ? (
                                availableDates.map((date) => (
                                    <SelectItem key={date} value={date} className="cursor-pointer font-mono">
                                        {date}
                                    </SelectItem>
                                ))
                            ) : (
                                <div className="py-2 px-3 text-sm text-muted-foreground">Loading dates...</div>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex flex-col gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Tag size={14} className="text-primary/70" /> Brand
                    </Label>
                    <GenericFilter<number>
                        mode="multi"
                        options={brandFilterOptions}
                        selected={filters.brandIds}
                        onChange={(value) => {
                            const ids = (value ?? []) as number[];
                            onFilterChange({ ...filters, brandIds: ids, skuCodes: [] });
                        }}
                        placeholder="All Brands"
                        searchPlaceholder="Search brand..."
                        emptyMessage="No brand found."
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Tag size={14} className="text-primary/70" /> Kategori Brand
                    </Label>
                    <GenericFilter<string>
                        mode="multi"
                        options={kategoriBrandFilterOptions}
                        selected={filters.kategoriBrands}
                        onChange={(value) => {
                            const kategori = (value ?? []) as string[];
                            onFilterChange({ ...filters, kategoriBrands: kategori });
                        }}
                        placeholder="All Kategori Brand"
                        searchPlaceholder="Search kategori brand..."
                        emptyMessage="No kategori brand found."
                        maxInlineSelected={10}
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Barcode size={14} className="text-primary/70" /> SKU
                    </Label>
                    <GenericFilter<string>
                        mode="multi"
                        options={skuFilterOptions}
                        selected={filters.skuCodes}
                        onChange={(value) => {
                            const codes = (value ?? []) as string[];
                            onFilterChange({ ...filters, skuCodes: codes });
                        }}
                        placeholder="All SKUs"
                        searchPlaceholder="Search SKU..."
                        emptyMessage="No SKU found."
                        onSearch={onSkuSearch}
                        onLoadMore={onSkuLoadMore}
                        hasMore={skuHasMoreOptions}
                        isLoading={skuSearchLoading}
                        isLoadingMore={skuLoadMoreLoading}
                        resolveOption={(code) => {
                            const opt = resolveSkuOption(code);
                            return opt ? { id: opt.code, label: opt.label, name: opt.name } : undefined;
                        }}
                        showPinnedSelected={true}
                        pinnedHeading="Selected SKUs"
                        width="w-[300px] md:w-[480px]"
                    />
                </div>
            </div>

            <div className="flex items-end pt-1 xl:pt-0">
                <Button
                    variant="ghost"
                    onClick={() =>
                        onFilterChange({
                            brandIds: [],
                            storeIds: [],
                            skuCodes: [],
                            kategoriBrands: [],
                        })
                    }
                    className="w-full xl:w-auto whitespace-nowrap text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-12"
                >
                    <X size={16} className="mr-2" /> Clear All
                </Button>
            </div>
        </div>
    );
}
