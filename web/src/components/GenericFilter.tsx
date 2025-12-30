import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
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
import type { FilterOption, GenericFilterConfig } from "@/types/filters";

export function GenericFilter<T extends string | number>({
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
    triggerClassName,
}: GenericFilterConfig<T>) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const listRef = useRef<HTMLDivElement | null>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const DEFAULT_RENDER_BATCH = 200;
    const [visibleCount, setVisibleCount] = useState(DEFAULT_RENDER_BATCH);
    const normalizedSearch = search.trim().toLowerCase();
    const hasSearch = normalizedSearch.length > 0;

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

    const matchesSearch = useCallback(
        (option: FilterOption<T>) => {
            if (!normalizedSearch) {
                return true;
            }
            const label = option.label.toLowerCase();
            const name = option.name?.toLowerCase() ?? "";
            const id = String(option.id).toLowerCase();
            return label.includes(normalizedSearch) || name.includes(normalizedSearch) || id.includes(normalizedSearch);
        },
        [normalizedSearch]
    );

    const filteredOptions = useMemo(() => {
        if (onSearch || !normalizedSearch) {
            return options;
        }

        const filtered = options.filter(matchesSearch);

        return filtered.sort((a, b) => {
            const aLabel = a.label.toLowerCase();
            const bLabel = b.label.toLowerCase();
            const aName = a.name?.toLowerCase() ?? "";
            const bName = b.name?.toLowerCase() ?? "";

            const aLabelStarts = aLabel.startsWith(normalizedSearch);
            const bLabelStarts = bLabel.startsWith(normalizedSearch);
            const aNameStarts = aName.startsWith(normalizedSearch);
            const bNameStarts = bName.startsWith(normalizedSearch);

            if (aLabelStarts && !bLabelStarts) return -1;
            if (!aLabelStarts && bLabelStarts) return 1;
            if (aNameStarts && !bNameStarts) return -1;
            if (!aNameStarts && bNameStarts) return 1;

            return aLabel.localeCompare(bLabel);
        });
    }, [matchesSearch, normalizedSearch, onSearch, options]);

    const filteredPinnedOptions = useMemo(() => {
        if (!showPinnedSelected) {
            return [];
        }
        if (!normalizedSearch) {
            return pinnedOptions;
        }
        return pinnedOptions.filter(matchesSearch);
    }, [matchesSearch, normalizedSearch, pinnedOptions, showPinnedSelected]);

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
                setVisibleCount((current) => Math.min(current + DEFAULT_RENDER_BATCH, filteredOptions.length));
            }

            if (!hasMore || isLoading || isLoadingMore || !onLoadMore) {
                return;
            }
            if (distanceToBottom < 48) {
                onLoadMore();
            }
        },
        [DEFAULT_RENDER_BATCH, filteredOptions.length, hasMore, isLoading, isLoadingMore, onLoadMore]
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
                <Button variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between font-normal h-auto min-h-12 py-2 px-3 bg-background border-border hover:bg-muted/50 transition-colors rounded-lg shadow-sm disconnect-min-h", triggerClassName)}>
                    {renderTriggerContent()}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className={cn(width, "p-0 shadow-xl border-border/60", minHeight)} align="start">
                <Command shouldFilter={false} className="rounded-lg border-none">
                    {searchable && (
                        <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={handleSearchChange} />
                    )}
                    <CommandList ref={listRef} onScroll={handleListScroll} className="max-h-[300px] overflow-y-auto custom-scrollbar">
                        {filteredPinnedOptions.length === 0 && filteredOptions.length === 0 && !isLoading && (
                            <CommandEmpty>{emptyMessage}</CommandEmpty>
                        )}
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
                            {filteredOptions.slice(0, visibleCount).map((option) => {
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