import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  CheckSquare,
  Square,
  ChevronDown,
  Hash,
  Star,
  StarOff,
  X,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Counts = Record<string, number>;

interface ProductFilterProps {
  /** All available category labels */
  categories: string[];

  /** LEGACY single-select (kept) */
  selectedCategory?: string | null;
  onCategoryChange?: (category: string | null) => void;

  /** NEW multi-select; presence of onCategoriesChange toggles multi-select mode */
  selectedCategories?: string[] | null;
  onCategoriesChange?: (categories: string[] | null) => void;

  /** Favorites (optional); persisted locally even if you don't pass this */
  favorites?: string[];
  onFavoritesChange?: (favs: string[]) => void;

  /** Optional tiny count bubble per category */
  categoryCounts?: Counts;

  /** Hide the entire Condition block */
  hideCondition?: boolean;

  /** Condition block (optional) */
  conditions?: string[];
  selectedCondition?: string | null;
  onConditionChange?: (condition: string | null) => void;

  /** Optional helper text for multi-select badge */
  multiselectLabel?: string;
}

const RECENTS_KEY = "synergy_recent_categories_v2";
const FAVS_KEY    = "synergy_favorite_categories_v1";

export const ProductFilter: React.FC<ProductFilterProps> = ({
  categories,

  // legacy single-select
  selectedCategory = null,
  onCategoryChange,

  // new multi-select
  selectedCategories = null,
  onCategoriesChange,

  favorites,
  onFavoritesChange,

  categoryCounts,

  hideCondition = false,
  conditions = [],
  selectedCondition = null,
  onConditionChange = () => {},
  multiselectLabel = "Multi-select",
}) => {
  const isMulti = typeof onCategoriesChange === "function";

  /* ── Recents (persist) ─────────────────────────────────────────────── */
  const [recents, setRecents] = React.useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, 8) : [];
    } catch {
      return [];
    }
  });

  const rememberRecent = (cat: string | null) => {
    if (!cat) return; // don't store All
    setRecents((prev) => {
      const next = [cat, ...prev.filter((x) => x !== cat)].slice(0, 8);
      try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  /* ── Favorites (persist + optional external control) ───────────────── */
  const [localFavs, setLocalFavs] = React.useState<string[]>(() => {
    // prefer controlled favorites; else restore from localStorage
    if (Array.isArray(favorites)) return favorites;
    try {
      const raw = localStorage.getItem(FAVS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });

  // keep local in sync if parent controls favorites
  React.useEffect(() => {
    if (Array.isArray(favorites)) setLocalFavs(favorites);
  }, [favorites]);

  const saveFavs = (next: string[]) => {
    setLocalFavs(next);
    try { localStorage.setItem(FAVS_KEY, JSON.stringify(next)); } catch {}
    onFavoritesChange?.(next);
  };

  const toggleFavorite = (c: string) => {
    const exists = localFavs.includes(c);
    const next = exists ? localFavs.filter((x) => x !== c) : [...localFavs, c];
    saveFavs(next);
  };

  /* ── A–Z groups (favorites pinned) ─────────────────────────────────── */
  const groups = React.useMemo(() => {
    const favSet = new Set(localFavs);
    const favs = categories.filter((c) => favSet.has(c)).sort((a,b)=>a.localeCompare(b));
    const rest = categories.filter((c) => !favSet.has(c));
    const map = new Map<string, string[]>();

    const addToMap = (arr: string[]) => {
      for (const c of arr) {
        const key = /^[A-Za-z]/.test(c) ? c[0]!.toUpperCase() : "#";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c);
      }
    };

    addToMap(rest);
    for (const [, arr] of map) arr.sort((a,b)=>a.localeCompare(b));

    const entries = Array.from(map.entries())
      .sort(([a],[b]) => (a==="#"?1:0) - (b==="#"?1:0) || a.localeCompare(b));

    return { favs, entries };
  }, [categories, localFavs]);

  /* ── Popover + pending selection (multi only) ──────────────────────── */
  const [open, setOpen] = React.useState(false);

  const currentMulti = React.useMemo<string[] | null>(() => {
    if (!isMulti) return null;
    return selectedCategories && selectedCategories.length ? [...selectedCategories] : [];
  }, [isMulti, selectedCategories]);

  const [pending, setPending] = React.useState<string[]>(currentMulti ?? []);
  React.useEffect(() => { if (isMulti) setPending(currentMulti ?? []); }, [isMulti, currentMulti]);

  const inPending = (c: string) => pending.includes(c);
  const togglePending = (c: string) =>
    setPending((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const clearPending = () => setPending([]);
  const applyPending = () => {
    onCategoriesChange?.(pending.length ? pending : null);
    if (pending.length === 1) rememberRecent(pending[0]);
    setOpen(false);
  };

  /* ── Single-select pick ────────────────────────────────────────────── */
  const handlePickSingle = (value: string | null) => {
    onCategoryChange?.(value);
    if (value) rememberRecent(value);
    setOpen(false);
  };

  /* ── Selection summary ─────────────────────────────────────────────── */
  const summary = React.useMemo(() => {
    if (isMulti) {
      const sel = selectedCategories ?? [];
      if (!sel.length) return "All Categories";
      if (sel.length <= 2) return sel.join(", ");
      return `${sel.slice(0,2).join(", ")} +${sel.length - 2}`;
    }
    return selectedCategory ?? "All Categories";
  }, [isMulti, selectedCategories, selectedCategory]);

  const renderCountBadge = (name: string) => {
    if (!categoryCounts) return null;
    const n = categoryCounts[name];
    if (typeof n !== "number") return null;
    return (
      <Badge variant="secondary" className="ml-auto text-[10px] font-medium rounded px-1.5">
        {n}
      </Badge>
    );
  };

  /* ── UI ────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* CATEGORIES */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-foreground">Categories</h3>
          {isMulti && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border opacity-80">
              <Layers className="h-3.5 w-3.5" />
              {multiselectLabel}
            </span>
          )}
        </div>

        {/* Quick chips (All + favorites + recents) */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <Button
            size="sm"
            variant={
              (isMulti && (!selectedCategories || selectedCategories.length === 0)) ||
              (!isMulti && selectedCategory === null)
                ? "default"
                : "outline"
            }
            className="h-7 px-2 text-xs rounded-md"
            onClick={() => (isMulti ? onCategoriesChange?.(null) : handlePickSingle(null))}
            title="Show all categories"
          >
            All
          </Button>

          {/* favorites (top 6) */}
          {groups.favs.slice(0, 6).map((c) => (
            <Button
              key={`fav-chip-${c}`}
              size="sm"
              variant={
                (isMulti && (selectedCategories ?? []).includes(c)) ||
                (!isMulti && selectedCategory === c)
                  ? "default"
                  : "outline"
              }
              className="h-7 px-2 text-xs rounded-md"
              onClick={() => (isMulti ? onCategoriesChange?.(toggleArr(selectedCategories, c)) : handlePickSingle(c))}
              title={`Favorite: ${c}`}
            >
              {c}
            </Button>
          ))}

          {/* recents (excluding favorites) */}
          {(recents || [])
            .filter((c) => !groups.favs.includes(c))
            .slice(0, 6)
            .map((c) => (
              <Button
                key={`recent-${c}`}
                size="sm"
                variant={
                  (isMulti && (selectedCategories ?? []).includes(c)) ||
                  (!isMulti && selectedCategory === c)
                    ? "default"
                    : "outline"
                }
                className="h-7 px-2 text-xs rounded-md"
                onClick={() => (isMulti ? onCategoriesChange?.(toggleArr(selectedCategories, c)) : handlePickSingle(c))}
                title={c}
              >
                {c}
              </Button>
            ))}
        </div>

        {/* Trigger */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-between h-9",
                "border border-border/60 hover:bg-accent/10"
              )}
              onClick={() => setOpen((o) => !o)}
            >
              <span className="truncate text-sm">{summary}</span>
              <ChevronDown className="h-4 w-4 opacity-70" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
            sideOffset={6}
          >
            <Command filter={(value, search) =>
              value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }>
              {/* Search + clear (multi) */}
              <div className="flex items-center gap-2 p-2 border-b">
                <CommandInput placeholder="Search categories…" className="text-sm flex-1" />
                {isMulti && (pending?.length ?? 0) > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={clearPending}
                    title="Clear selection"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <CommandList className="max-h-72">
                <CommandEmpty className="py-6 text-sm text-muted-foreground">
                  No categories found.
                </CommandEmpty>

                {/* Favorites group */}
                {localFavs.length > 0 && (
                  <CommandGroup heading="Favorites">
                    {localFavs
                      .filter((c) => categories.includes(c))
                      .sort((a,b)=>a.localeCompare(b))
                      .map((c) => (
                        <CommandItem
                          key={`fav-${c}`}
                          value={c}
                          onSelect={() =>
                            isMulti ? togglePending(c) : handlePickSingle(c)
                          }
                        >
                          {/* Checkbox for multi; spacekeeper for single */}
                          {isMulti ? (
                            inPending(c) ? (
                              <CheckSquare className="mr-2 h-4 w-4" />
                            ) : (
                              <Square className="mr-2 h-4 w-4 opacity-60" />
                            )
                          ) : (
                            <span className="mr-2 inline-block w-4" />
                          )}

                          <span className="truncate">{c}</span>
                          {renderCountBadge(categoryCounts, c)}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="ml-2 h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(c); }}
                            title="Unpin"
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                )}

                {/* A–Z groups */}
                {groups.entries.map(([letter, arr]) => (
                  <CommandGroup
                    key={letter}
                    heading={letter === "#" ? <Hash className="h-3.5 w-3.5" /> : letter}
                  >
                    {arr.map((c) => (
                      <CommandItem
                        key={c}
                        value={c}
                        onSelect={() =>
                          isMulti ? togglePending(c) : handlePickSingle(c)
                        }
                      >
                        {isMulti ? (
                          inPending(c) ? (
                            <CheckSquare className="mr-2 h-4 w-4" />
                          ) : (
                            <Square className="mr-2 h-4 w-4 opacity-60" />
                          )
                        ) : (
                          <span className="mr-2 inline-block w-4" />
                        )}

                        <span className="truncate">{c}</span>
                        {renderCountBadge(categoryCounts, c)}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-2 h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(c); }}
                          title={localFavs.includes(c) ? "Unpin" : "Pin"}
                        >
                          {localFavs.includes(c) ? <Star className="h-4 w-4" /> : <StarOff className="h-4 w-4" />}
                        </Button>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>

              {/* Multi-select footer */}
              {isMulti && (
                <div className="flex items-center justify-between border-t px-2 py-2">
                  <div className="text-xs opacity-70">
                    {pending.length ? `${pending.length} selected` : "All categories"}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={clearPending}>
                      Clear
                    </Button>
                    <Button size="sm" className="h-8 px-3 text-xs" onClick={applyPending}>
                      Apply
                    </Button>
                  </div>
                </div>
              )}
            </Command>
          </PopoverContent>
        </Popover>

        {/* Selected chips (multi) */}
        {isMulti && (selectedCategories?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(selectedCategories ?? []).map((c) => (
              <Badge key={`sel-${c}`} variant="secondary" className="text-xs gap-1">
                {c}
                <button
                  className="ml-1 opacity-70 hover:opacity-100"
                  onClick={() => onCategoriesChange?.(removeFrom(selectedCategories, c))}
                  aria-label={`Remove ${c}`}
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* CONDITION (optional; unchanged) */}
      {!hideCondition && conditions.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-foreground mb-2">Condition</h3>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={selectedCondition === null ? "default" : "outline"}
              className="h-7 px-2 text-xs rounded-md"
              onClick={() => onConditionChange!(null)}
            >
              All
            </Button>
            {conditions.map((condition) => (
              <Button
                key={condition}
                size="sm"
                variant={selectedCondition === condition ? "default" : "outline"}
                className="h-7 px-2 text-xs rounded-md"
                onClick={() => onConditionChange!(condition)}
              >
                {condition}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── helpers ─────────────────────────────────────────────────────────── */

function renderCountBadge(map: Counts | undefined, name: string) {
  if (!map) return null;
  const n = map[name];
  if (typeof n !== "number") return null;
  return (
    <Badge variant="secondary" className="ml-auto text-[10px] font-medium rounded px-1.5">
      {n}
    </Badge>
  );
}

function toggleArr(arr: string[] | null | undefined, v: string): string[] | null {
  const cur = Array.isArray(arr) ? arr : [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : null;
}

function removeFrom(arr: string[] | null | undefined, v: string): string[] | null {
  const cur = Array.isArray(arr) ? arr : [];
  const next = cur.filter((x) => x !== v);
  return next.length ? next : null;
}
