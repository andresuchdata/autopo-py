import { useMemo, useState } from "react";
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
import { type LabeledOption } from "@/hooks/useStockData";

interface DashboardFiltersProps {
    filters: DashboardFiltersState;
    onFilterChange: (filters: DashboardFiltersState) => void;
    brandOptions: LabeledOption[];
    storeOptions: LabeledOption[];
    selectedDate: string | null;
    availableDates: string[];
    onDateChange: (date: string) => void;
}

export function DashboardFilters({
    filters,
    onFilterChange,
    brandOptions,
    storeOptions,
    selectedDate,
    availableDates,
    onDateChange,
}: DashboardFiltersProps) {
    return (
        <div className="flex flex-col md:flex-row gap-4 mb-8 bg-white p-4 rounded-lg shadow-sm border">
            <div className="flex-1 min-w-[200px]">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block">
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
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block">
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

            <div className="flex-1 min-w-[200px]">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block">
                    Store
                </Label>
                <OptionsMultiSelect
                    options={storeOptions}
                    selectedIds={filters.storeIds}
                    onChange={(ids) => onFilterChange({ ...filters, storeIds: ids })}
                    placeholder="All Stores"
                    searchPlaceholder="Search store..."
                />
            </div>

            <div className="flex items-end">
                <Button
                    variant="outline"
                    onClick={() => onFilterChange({ brandIds: [], storeIds: [] })}
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
