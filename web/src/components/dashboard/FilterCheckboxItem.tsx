import React from "react";
import { Check } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FilterCheckboxItemProps {
  id: number;
  name: string;
  isSelected: boolean;
  onToggle: (id: number) => void;
}

export const FilterCheckboxItem = React.memo<FilterCheckboxItemProps>(
  ({ id, name, isSelected, onToggle }) => {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <CommandItem
              key={id}
              onSelect={() => onToggle(id)}
            >
              <div
                className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all ${isSelected
                  ? "bg-primary text-primary-foreground"
                  : "opacity-50 [&_svg]:invisible"
                  }`}
              >
                <Check className="h-3 w-3" />
              </div>
              <span className="truncate text-sm">{name}</span>
            </CommandItem>
          </TooltipTrigger>
          <TooltipContent>
            <p>{name}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
);

FilterCheckboxItem.displayName = "FilterCheckboxItem";
