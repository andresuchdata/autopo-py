import { useCallback, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
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

interface SkuMultiSelectProps {
    options: SkuOption[];
    selectedCodes: string[];
    onChange: (codes: string[]) => void;
    onSearch: (search?: string) => void;
    onLoadMore: () => void;
    hasMore: boolean;
    isLoadingMore?: boolean;
    resolveOption?: (code: string) => SkuOption | undefined;
    placeholder: string;
    searchPlaceholder: string;
    isLoading?: boolean;
}

function SkuMultiSelect({
    options = [],
    selectedCodes = [],
    onChange,
    onSearch,
    onLoadMore,
    hasMore,
    isLoadingMore,
    resolveOption,
    placeholder,
    searchPlaceholder,
    isLoading,
}: SkuMultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const listRef = useRef<HTMLDivElement | null>(null);

    const handleSearchChange = (value: string) => {
        setSearch(value);
        onSearch(value);
    };

    const optionMap = useMemo(() => {
        const map = new Map<string, SkuOption>();
        options.forEach((option) => {
            map.set(option.code, option);
        });
        return map;
    }, [options]);

    const selectedLabels = useMemo(
        () =>
            selectedCodes.map((code) => {
                const option = optionMap.get(code) ?? resolveOption?.(code);
                return option?.label ?? code;
            }),
        [optionMap, resolveOption, selectedCodes]
    );
    const pinnedOptions = useMemo(
        () =>
            selectedCodes.map((code) => {
                const option = optionMap.get(code) ?? resolveOption?.(code);
                const baseLabel = option?.label ?? code;
                const explicitName = option?.name;
                const derivedName = !explicitName && baseLabel.includes(" - ") ? baseLabel.split(" - ", 2)[1] : undefined;
                const name = explicitName ?? derivedName;
                return {
                    code,
                    label: baseLabel,
                    name,
                };
            }),
        [optionMap, resolveOption, selectedCodes]
    );
    const availableOptions = useMemo(() => options.filter((option) => !selectedCodes.includes(option.code)), [options, selectedCodes]);

    const toggleOption = (code: string) => {
        if (selectedCodes.includes(code)) {
            onChange(selectedCodes.filter((value) => value !== code));
        } else {
            onChange([...selectedCodes, code]);
        }
    };

    const handleListScroll = useCallback(
        (event: React.UIEvent<HTMLDivElement>) => {
            if (!hasMore || isLoading || isLoadingMore) {
                return;
            }
            const target = event.currentTarget;
            const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
            if (distanceToBottom < 48) {
                onLoadMore();
            }
        },
        [hasMore, isLoading, isLoadingMore, onLoadMore]
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal h-auto min-h-10 py-2">
                    <div className="flex flex-wrap gap-1 items-center flex-1 min-w-0 text-left">
                        {selectedCodes.length === 0 && placeholder}
                        {selectedCodes.length > 0 && selectedCodes.length <= 2 && (
                            selectedLabels.map((label, idx) => (
                                <span
                                    key={`${label}-${idx}`}
                                    className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mr-1 mb-1 max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                                >
                                    {label}
                                    <span
                                        className="ml-1 cursor-pointer"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const code = selectedCodes[idx];
                                            toggleOption(code);
                                        }}
                                    >
                                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                    </span>
                                </span>
                            ))
                        )}
                        {selectedCodes.length > 2 && (
                            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mr-1">
                                {selectedCodes.length} selected
                            </span>
                        )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] md:w-[420px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={handleSearchChange} />
                    <CommandList ref={listRef} onScroll={handleListScroll} className="max-h-64 overflow-y-auto">
                        <CommandEmpty>No SKU found.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem onSelect={() => onChange([])} className="justify-center text-center font-medium text-sm">
                                Clear selection
                            </CommandItem>
                        </CommandGroup>
                        {pinnedOptions.length > 0 && (
                            <CommandGroup heading="Selected SKUs">
                                {pinnedOptions.map((option) => (
                                    <CommandItem key={`pinned-${option.code}`} value={option.label} onSelect={() => toggleOption(option.code)}>
                                        <div
                                            className={cn(
                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                selectedCodes.includes(option.code)
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50 [&_svg]:invisible"
                                            )}
                                        >
                                            <Check className={cn("h-4 w-4")} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-sm leading-none mb-2">{option.code}</span>
                                            {option.name && <span className="text-xs text-muted-foreground">{option.name}</span>}
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                        {isLoading && (
                            <CommandGroup>
                                <CommandItem disabled className="justify-center text-muted-foreground text-sm">
                                    Searching...
                                </CommandItem>
                            </CommandGroup>
                        )}
                        <CommandGroup>
                            {availableOptions.map((option) => {
                                const isSelected = selectedCodes.includes(option.code);
                                return (
                                    <CommandItem key={option.code} value={option.label} onSelect={() => toggleOption(option.code)}>
                                        <div
                                            className={cn(
                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50 [&_svg]:invisible"
                                            )}
                                        >
                                            <Check className={cn("h-4 w-4")} />
                                        </div>
                                        {option.label}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        {hasMore && !isLoading && (
                            <CommandGroup>
                                <CommandItem disabled={isLoadingMore} onSelect={onLoadMore} className="justify-center text-sm text-primary">
                                    {isLoadingMore ? "Loading more..." : "Load more"}
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
    const selectableStoreOptions = useMemo(() => storeOptions.filter((option) => option.id !== null), [storeOptions]);
    const selectedStoreId = filters.storeIds[0] ?? null;

    return (
        <div className="flex flex-col md:flex-row gap-4 mb-8 bg-white dark:bg-gray-800/50 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            <div className="flex-1 min-w-[200px]">
                <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Store
                </Label>
                <Select
                    value={selectedStoreId !== null ? String(selectedStoreId) : ""}
                    onValueChange={(value) => onFilterChange({ ...filters, storeIds: value ? [Number(value)] : [] })}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select store" />
                    </SelectTrigger>
                    <SelectContent>
                        {selectableStoreOptions.length > 0 ? (
                            selectableStoreOptions.map((option) => (
                                <SelectItem key={option.id} value={String(option.id)}>
                                    {option.name}
                                </SelectItem>
                            ))
                        ) : (
                            <div className="py-2 px-3 text-sm text-muted-foreground">No stores available</div>
                        )}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex-1 max-w-[200px]">
                <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Date
                </Label>
                <Select value={selectedDate || ""} onValueChange={onDateChange}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Date" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableDates.length > 0 ? (
                            availableDates.map((date) => (
                                <SelectItem key={date} value={date}>
                                    {date}
                                </SelectItem>
                            ))
                        ) : (
                            <div className="py-2 px-3 text-sm text-muted-foreground">Loading dates...</div>
                        )}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
                <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Brand
                </Label>
                <OptionsMultiSelect
                    options={brandOptions}
                    selectedIds={filters.brandIds}
                    onChange={(ids) => onFilterChange({ ...filters, brandIds: ids })}
                    placeholder="All Brands"
                    searchPlaceholder="Search brand..."
                />
            </div>

            <div className="flex-1 min-w-[320px]">
                <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    SKU
                </Label>
                <SkuMultiSelect
                    options={skuOptions}
                    selectedCodes={filters.skuCodes}
                    onChange={(codes: string[]) => onFilterChange({ ...filters, skuCodes: codes })}
                    onSearch={onSkuSearch}
                    onLoadMore={onSkuLoadMore}
                    hasMore={skuHasMoreOptions}
                    isLoadingMore={skuLoadMoreLoading}
                    resolveOption={resolveSkuOption}
                    placeholder="All SKUs"
                    searchPlaceholder="Search SKU..."
                    isLoading={skuSearchLoading}
                />
            </div>

            <div className="flex items-end">
                <Button
                    variant="outline"
                    onClick={() => onFilterChange({ brandIds: [], storeIds: [], skuCodes: [] })}
                    className="w-full md:w-auto whitespace-nowrap"
                >
                    Clear Filters
                </Button>
            </div>
        </div>
    );
}

interface OptionsMultiSelectProps {
    options: LabeledOption[];
    selectedIds: number[];
    onChange: (ids: number[]) => void;
    placeholder: string;
    searchPlaceholder: string;
}

function OptionsMultiSelect({
    options = [],
    selectedIds = [],
    onChange,
    placeholder,
    searchPlaceholder,
}: OptionsMultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const selectableOptions = useMemo(() => options.filter((opt) => opt.id !== null), [options]);
    const selectedLabels = useMemo(() => {
        const map = new Map(selectableOptions.map((opt) => [opt.id, opt.name] as const));
        return selectedIds.map((id) => map.get(id) ?? `#${id}`);
    }, [selectableOptions, selectedIds]);

    const filteredOptions = useMemo(() => {
        const query = search.toLowerCase();
        return selectableOptions.filter((opt) => opt.name.toLowerCase().includes(query));
    }, [selectableOptions, search]);

    const toggleOption = (id: number) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter((value) => value !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal h-auto min-h-10 py-2">
                    <div className="flex flex-wrap gap-1 items-center">
                        {selectedIds.length === 0 && placeholder}
                        {selectedIds.length > 0 && selectedIds.length <= 2 && (
                            selectedLabels.map((label, idx) => (
                                <span key={`${label}-${idx}`} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mr-1 mb-1">
                                    {label}
                                    <span
                                        className="ml-1 cursor-pointer"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const id = selectedIds[idx];
                                            toggleOption(id);
                                        }}
                                    >
                                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                    </span>
                                </span>
                            ))
                        )}
                        {selectedIds.length > 2 && (
                            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mr-1">
                                {selectedIds.length} selected
                            </span>
                        )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
                    <CommandList>
                        <CommandEmpty>No item found.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem onSelect={() => onChange([])} className="justify-center text-center font-medium text-sm">
                                Clear selection
                            </CommandItem>
                        </CommandGroup>
                        <CommandGroup>
                            {filteredOptions.map((option) => {
                                const isSelected = option.id !== null && selectedIds.includes(option.id);
                                return (
                                    <CommandItem
                                        key={option.id ?? option.name}
                                        value={option.name}
                                        onSelect={() => option.id !== null && toggleOption(option.id)}
                                    >
                                        <div
                                            className={cn(
                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50 [&_svg]:invisible"
                                            )}
                                        >
                                            <Check className={cn("h-4 w-4")} />
                                        </div>
                                        {option.name}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
