import React, { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { cls } from "@/lib/api"; 
import type { Category } from "@/types/manager";

type Props = {
  value: string | null;
  categories: Category[];
  onChange: (val: string) => void;
};

export default function CategorySelector({ value, categories, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selectedCat = categories.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cls(
            "h-8 w-full justify-between px-2 text-xs",
            !value ? "text-muted-foreground border-dashed" : "text-foreground"
          )}
        >
          {selectedCat ? (
            <span className="truncate flex items-center gap-2">
              {selectedCat.label}
              {selectedCat.prefix && (
                <span className="font-mono text-[10px] opacity-50 bg-muted px-1 rounded">
                  {selectedCat.prefix}
                </span>
              )}
            </span>
          ) : (
            "Unassigned"
          )}
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      
      {/* FIX: Use w-[--radix-popover-trigger-width] to match button width exactly */}
      <PopoverContent 
        className="w-[--radix-popover-trigger-width] p-0 z-[200]" 
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup>
              {categories.map((category) => (
                <CommandItem
                  key={category.id}
                  value={category.label}
                  onSelect={() => {
                    onChange(category.id);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cls(
                      "mr-2 h-3.5 w-3.5",
                      value === category.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">{category.label}</span>
                  {category.prefix && (
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {category.prefix}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}