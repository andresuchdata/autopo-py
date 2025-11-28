import { useState, useEffect } from "react";
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

interface DashboardFiltersProps {
    filters: { brand?: string; store?: string };
    onFilterChange: (filters: { brand?: string; store?: string }) => void;
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

            {/* Brand Filter (Searchable) */}
            <div className="flex-1">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block">
                    Brand
                </Label>
                <SearchableSelect
                    items={brands}
                    value={filters.brand}
                    onChange={(value) => onFilterChange({ ...filters, brand: value })}
                    placeholder="All Brands"
                    searchPlaceholder="Search brand..."
                />
            </div>

            {/* Store Filter (Searchable) */}
            <div className="flex-1">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block">
                    Store
                </Label>
                <SearchableSelect
                    items={stores}
                    value={filters.store}
                    onChange={(value) => onFilterChange({ ...filters, store: value })}
                    placeholder="All Stores"
                    searchPlaceholder="Search store..."
                />
            </div>

            <div className="flex items-end">
                <Button
                    variant="outline"
                    onClick={() => onFilterChange({})}
                    className="w-full md:w-auto whitespace-nowrap"
                >
                    Clear Filters
                </Button>
            </div>
        </div>
    );
}

interface SearchableSelectProps {
    items: string[];
    value?: string;
    onChange: (value?: string) => void;
    placeholder: string;
    searchPlaceholder: string;
}

function SearchableSelect({
    items,
    value,
    onChange,
    placeholder,
    searchPlaceholder,
}: SearchableSelectProps) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    {value ? items.find((item) => item === value) || value : placeholder}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
                <Command>
                    <CommandInput placeholder={searchPlaceholder} />
                    <CommandList>
                        <CommandEmpty>No item found.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem
                                value="all"
                                onSelect={() => {
                                    onChange(undefined);
                                    setOpen(false);
                                }}
                            >
                                <Check
                                    className={cn(
                                        "mr-2 h-4 w-4",
                                        !value ? "opacity-100" : "opacity-0"
                                    )}
                                />
                                {placeholder}
                            </CommandItem>
                            {items.map((item) => (
                                <CommandItem
                                    key={item}
                                    value={item}
                                    onSelect={(currentValue) => {
                                        onChange(currentValue === value ? undefined : currentValue);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === item ? "opacity-100" : "opacity-0"
                                        )}
                                    />
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
