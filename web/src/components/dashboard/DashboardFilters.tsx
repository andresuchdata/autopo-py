import { useMemo } from "react";
import { X, Store as StoreIcon, Calendar, Tag, Barcode, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { GenericFilter } from "@/components/GenericFilter";
import type { FilterOption } from "@/types/filters";

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
        <div className="flex flex-col xl:flex-row gap-4 mb-4 bg-card/40 backdrop-blur-md p-4 rounded-xl shadow-sm border border-border/40 transition-all hover:bg-card/50">
            <div className="flex items-start gap-2.5 text-muted-foreground border-r border-border/40 pr-4 hidden xl:flex">
                <div className="p-1.5 bg-muted rounded-md">
                    <Filter size={18} />
                </div>
                <div className="text-sm font-medium mt-1.5">
                    Filters
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 flex-1">
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-tighter flex items-center gap-1">
                        <StoreIcon size={12} className="text-primary/60" /> Store
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

                <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-tighter flex items-center gap-1">
                        <Calendar size={12} className="text-primary/60" /> Date (Snapshot)
                    </Label>
                    <Select value={selectedDate || ""} onValueChange={onDateChange}>
                        <SelectTrigger className="w-full h-9 py-1 px-2.5 bg-background/50 border-border/60 hover:bg-muted/30 transition-colors rounded-md shadow-sm text-sm">
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
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-tighter flex items-center gap-1">
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
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-tighter flex items-center gap-1">
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
                    <Label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-tighter flex items-center gap-1">
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
                    className="w-full xl:w-auto h-9 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-md"
                >
                    <X size={14} className="mr-1.5" /> Clear All
                </Button>
            </div>
        </div >
    );
}
