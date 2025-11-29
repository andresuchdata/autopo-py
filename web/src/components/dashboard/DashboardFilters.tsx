import { useState } from "react";
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
    CommandSeparator,
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

interface DashboardFiltersProps {
    filters: { brand: string[]; store: string[] };
    onFilterChange: (filters: { brand: string[]; store: string[] }) => void;
    brands: string[];
    stores: string[];
    selectedDate: string | null;
    availableDates: string[];
    onDateChange: (date: string) => void;
}

export function DashboardFilters({
    filters,
    onFilterChange,
    brands,
    stores,
    selectedDate,
    availableDates,
    onDateChange,
}: DashboardFiltersProps) {
    return (
        <div className="flex flex-col md:flex-row gap-4 mb-8 bg-white p-4 rounded-lg shadow-sm border">
            {/* Date Filter */}
            <div className="flex-1">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block">
                    Date
                </Label>
                <Select
                    value={selectedDate || ""}
                    onValueChange={(value) => onDateChange(value)}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Date" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableDates.map((date) => (
                            <SelectItem key={date} value={date}>
                                {date}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Brand Filter (Multi-select) */}
            <div className="flex-1">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block">
                    Brand
                </Label>
                <MultiSelect
                    items={brands}
                    selected={filters.brand}
                    onChange={(value) => onFilterChange({ ...filters, brand: value })}
                    placeholder="All Brands"
                    searchPlaceholder="Search brand..."
                />
            </div>

            {/* Store Filter (Multi-select) */}
            <div className="flex-1">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block">
                    Store
                </Label>
                <MultiSelect
                    items={stores}
                    selected={filters.store}
                    onChange={(value) => onFilterChange({ ...filters, store: value })}
                    placeholder="All Stores"
                    searchPlaceholder="Search store..."
                />
            </div>

            <div className="flex items-end">
                <Button
                    variant="outline"
                    onClick={() => onFilterChange({ brand: [], store: [] })}
                    className="w-full md:w-auto whitespace-nowrap"
                >
                    Clear Filters
                </Button>
            </div>
        </div>
    );
}

interface MultiSelectProps {
    items: string[];
    selected: string[];
    onChange: (value: string[]) => void;
    placeholder: string;
    searchPlaceholder: string;
}

function MultiSelect({
    items,
    selected,
    onChange,
    placeholder,
    searchPlaceholder,
}: MultiSelectProps) {
    const [open, setOpen] = useState(false);

    const handleSelect = (item: string) => {
        if (selected.includes(item)) {
            onChange(selected.filter((i) => i !== item));
        } else {
            onChange([...selected, item]);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal h-auto min-h-10 py-2"
                >
                    <div className="flex flex-wrap gap-1 items-center">
                        {selected.length === 0 && placeholder}
                        {selected.length > 0 && selected.length <= 2 && (
                            selected.map((item) => (
                                <span key={item} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mr-1 mb-1">
                                    {item}
                                    <span
                                        className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleSelect(item);
                                        }}
                                    >
                                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                    </span>
                                </span>
                            ))
                        )}
                        {selected.length > 2 && (
                            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mr-1">
                                {selected.length} selected
                            </span>
                        )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={searchPlaceholder} />
                    <CommandList>
                        <CommandEmpty>No item found.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem
                                onSelect={() => onChange([])}
                                className="justify-center text-center font-medium"
                            >
                                Clear selection
                            </CommandItem>
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup>
                            {items.map((item) => (
                                <CommandItem
                                    key={item}
                                    value={item}
                                    onSelect={() => handleSelect(item)}
                                >
                                    <div
                                        className={cn(
                                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                            selected.includes(item)
                                                ? "bg-primary text-primary-foreground"
                                                : "opacity-50 [&_svg]:invisible"
                                        )}
                                    >
                                        <Check className={cn("h-4 w-4")} />
                                    </div>
                                    {item}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
