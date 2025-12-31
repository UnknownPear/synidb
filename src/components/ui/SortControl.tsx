import * as React from "react";
import { ArrowDownAZ, ArrowUpAZ, Calendar, Hash, ArrowUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type SortConfig = {
  key: string;
  dir: "asc" | "desc";
};

interface SortControlProps {
  config: SortConfig;
  onChange: (config: SortConfig) => void;
}

export function SortControl({ config, onChange }: SortControlProps) {
  const activeLabel = React.useMemo(() => {
    if (config.key === "productName") return "Product Name";
    if (config.key === "synergyId") return "Synergy ID";
    if (config.key === "date") return "Date";
    return "Sort";
  }, [config]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 border-dashed bg-transparent hover:bg-muted/50">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{activeLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Sort By</DropdownMenuLabel>
        
        <DropdownMenuItem onClick={() => onChange({ key: "productName", dir: "asc" })}>
          <ArrowDownAZ className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          <span>Name (A-Z)</span>
          {config.key === "productName" && config.dir === "asc" && <Check className="ml-auto h-3 w-3" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange({ key: "productName", dir: "desc" })}>
          <ArrowUpAZ className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          <span>Name (Z-A)</span>
          {config.key === "productName" && config.dir === "desc" && <Check className="ml-auto h-3 w-3" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => onChange({ key: "synergyId", dir: "asc" })}>
          <Hash className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          <span>ID (Ascending)</span>
          {config.key === "synergyId" && config.dir === "asc" && <Check className="ml-auto h-3 w-3" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange({ key: "synergyId", dir: "desc" })}>
          <Hash className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          <span>ID (Descending)</span>
          {config.key === "synergyId" && config.dir === "desc" && <Check className="ml-auto h-3 w-3" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => onChange({ key: "date", dir: "desc" })}>
          <Calendar className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          <span>Date (Newest)</span>
          {config.key === "date" && config.dir === "desc" && <Check className="ml-auto h-3 w-3" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange({ key: "date", dir: "asc" })}>
          <Calendar className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          <span>Date (Oldest)</span>
          {config.key === "date" && config.dir === "asc" && <Check className="ml-auto h-3 w-3" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}