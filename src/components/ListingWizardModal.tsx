import { useEffect, useMemo, useState, useReducer, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  upsertInventoryItem,
  createOffer,
  publishOffer,
  // Prefer marketplace-aware fetch; gracefully falls back inside effect:
  getPoliciesByMarketplace as _getPoliciesByMarketplace,
  getPolicies as _getPoliciesFallback,
  getAspects,
  getCategorySuggestions,
  ebayGetItemById,
  ebayGetItemByLegacyId,
  getInventoryLocations,
  // Optional helper; if not present the component will parse offerId from error:
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  // @ts-ignore – OK if your dataClient doesn’t export it
  getOffersBySku as _getOffersBySku,
  // Fetch allowed conditions for category/marketplace
  // @ts-ignore – make sure dataClient exports this
  getItemConditionPolicies,
  // Update an existing offer when it already exists
  // @ts-ignore – make sure dataClient exports this
  updateOffer,
} from "@/lib/dataClient";
import type { InventoryRow } from "@/lib/dataClient";

/* ───────────────────────────── types ───────────────────────────── */

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: InventoryRow;
  onPosted?: () => void;
};

type AspectsMap = Record<string, string>;
type Photo = { url: string };

type PaymentPolicy = {
  paymentPolicyId?: string;
  id?: string;
  name?: string;
  immediatePay?: boolean;
};

type FulfillmentPolicy = {
  fulfillmentPolicyId?: string;
  id?: string;
  name?: string;
  shippingOptions?: Array<{
    type?: string; // SHIPPING | PICKUP
    services?: any[];
    localPickup?: boolean;
  }>;
  localPickup?: boolean;
};

type ReturnPolicy = {
  returnPolicyId?: string;
  id?: string;
  name?: string;
};


/* ───────────────────────────── constants ─────────────────────────── */

const DEFAULT_CAT =
  (import.meta as any)?.env?.VITE_DEFAULT_EBAY_CATEGORY_ID || "";

const MARKETPLACE_ID =
  (import.meta as any)?.env?.VITE_EBAY_MARKETPLACE_ID || "EBAY_US";

const DEFAULT_MLK =
  ((import.meta as any)?.env?.VITE_EBAY_MERCHANT_LOCATION_KEY as string) || "";

// eBay condition ID → Inventory ConditionEnum (3000 is generic USED)
// Replace your CONDITION_ID_TO_ENUM with this:
const CONDITION_ID_TO_ENUM: Record<number, string> = {
  1000: "NEW",
  1500: "NEW_OTHER",
  1750: "NEW_WITH_DEFECTS",
  2000: "CERTIFIED_REFURBISHED",
  2010: "EXCELLENT_REFURBISHED",
  2020: "VERY_GOOD_REFURBISHED",
  2030: "GOOD_REFURBISHED",
  2500: "SELLER_REFURBISHED",
  2750: "LIKE_NEW",
  2990: "USED_EXCELLENT",
  3000: "USED",
  4000: "USED_VERY_GOOD",
  5000: "USED_GOOD",
  6000: "USED_ACCEPTABLE",
  7000: "FOR_PARTS_OR_NOT_WORKING",
};


// Prefer order when user selects “Used”
const USED_PREF_ORDER = [5000, 4000, 3000, 6000]; // Good → Very Good → (generic) Used → Acceptable



type ConditionOption = { id: number; label: string; enumVal: string };

// Allowed units per Inventory API
const WEIGHT_UNITS = ["POUND", "OUNCE", "KILOGRAM", "GRAM"] as const;
const DIM_UNITS = ["INCH", "CENTIMETER"] as const;

/* ───────────────────────────── helpers ───────────────────────────── */

async function resolveAllowedCondition(
  marketplaceId: string,
  categoryId: string,
  uiChoice: string // "NEW", "USED", or a specific enum
): Promise<{ finalEnum: string; allowedEnums: string[]; allowedLabels: string[] }> {
  // Fetch policy (id list varies by category)
  const res: any = await getItemConditionPolicies({ marketplaceId, categoryId });
  const raw = res?.itemConditionPolicies?.[0]?.itemConditions ?? [];

  const allowedIds = new Set<number>(
    raw.map((c: any) => getCondId(c)).filter((id): id is number => id !== undefined)
  );

  const allowedEnums = Array.from(allowedIds)
    .map((id) => CONDITION_ID_TO_ENUM[id])
    .filter(Boolean) as string[];

  // Robust label generation for error message
  const allowedLabels = raw.map((c: any) => {
    const id = getCondId(c);
    const enumVal = id !== undefined ? CONDITION_ID_TO_ENUM[id] : undefined;
    const ebayLabel = c?.displayName && String(c.displayName).trim();

    return (
      (id === 3000 ? "Used" : ebayLabel) ||
      prettyEnumLabel(enumVal) ||
      String(id)
    );
  }).filter(Boolean);

  // Log for debugging
  console.log(`Category ${categoryId} allows conditions:`, { allowedIds, allowedEnums, allowedLabels });

  // If the user picked a specific enum and it's allowed, keep it
  if (allowedEnums.includes(uiChoice)) {
    return { finalEnum: uiChoice, allowedEnums, allowedLabels };
  }

  // Handle "USED" or specific used grades
  if (uiChoice === "USED" || /^USED_/.test(uiChoice)) {
    // Prioritize specific used grades in preferred order
    for (const id of USED_PREF_ORDER) { // [5000, 4000, 6000]
      if (allowedIds.has(id)) {
        const finalEnum = CONDITION_ID_TO_ENUM[id];
        console.log(`Coercing ${uiChoice} to ${finalEnum} (ID ${id})`);
        return { finalEnum, allowedEnums, allowedLabels };
      }
    }
    // If no specific used grades are allowed, check if generic USED (3000) is explicitly allowed
    if (allowedIds.has(3000)) {
      console.log("Using generic USED (ID 3000) as fallback");
      return { finalEnum: "USED", allowedEnums, allowedLabels };
    }
  }

  // New family coercions
  if (uiChoice === "NEW") {
    if (allowedIds.has(1000)) return { finalEnum: "NEW", allowedEnums, allowedLabels };
    if (allowedIds.has(1500)) return { finalEnum: "NEW_OTHER", allowedEnums, allowedLabels };
    if (allowedIds.has(1750)) return { finalEnum: "NEW_WITH_DEFECTS", allowedEnums, allowedLabels };
  }

  // Last resort: pick the first allowed condition
  if (allowedEnums.length > 0) {
    console.log(`No match for ${uiChoice}; defaulting to ${allowedEnums[0]}`);
    return { finalEnum: allowedEnums[0], allowedEnums, allowedLabels };
  }

  // No allowed conditions; throw a clear error
  const pretty = allowedLabels.join(", ") || allowedEnums.join(", ") || "None";
  throw new Error(`Condition "${prettyEnumLabel(uiChoice)}" is not allowed for category ${categoryId}. Allowed: ${pretty}.`);
}

function extractEbayIdFromUrl(input: string): {
  restfulId?: string;
  legacyId?: string;
} {
  const s = (input || "").trim();
  if (!s) return {};
  if (s.includes("|")) return { restfulId: s };
  if (/^\d{12,15}$/.test(s)) return { legacyId: s };
  try {
    const u = new URL(s);
    const parts = u.pathname.split("/").filter(Boolean);
    const tail = parts[parts.length - 1] || "";
    if (/^\d{12,15}$/.test(tail)) return { legacyId: tail };
    const qId =
      u.searchParams.get("item") ||
      u.searchParams.get("itm") ||
      u.searchParams.get("itemid") ||
      "";
    if (/^\d{12,15}$/.test(qId)) return { legacyId: qId };
    const hash = u.searchParams.get("hash") || "";
    const m = /itemid:(\d{12,15})/i.exec(hash);
    if (m) return { legacyId: m[1] };
  } catch {}
  return {};
}

function textareaRows(s: string) {
  const lines = (s || "").split(/\r?\n/).length;
  return Math.min(14, Math.max(6, lines));
}

function toStringArray(v: any): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v
      .flatMap((x) => (x == null ? [] : [String(x).trim()]))
      .filter((s) => s.length > 0 && s.length <= 65);
  }
  if (typeof v === "object") {
    try {
      const s = Object.entries(v as Record<string, any>)
        .map(([k, val]) => `${k}: ${String(val)}`)
        .join(", ");
      return s ? [s.slice(0, 65)] : [];
    } catch {
      return [];
    }
  }
  const s = String(v).trim();
  return s ? [s.slice(0, 65)] : [];
}

function sanitizeAspects(input: Record<string, any> | undefined | null) {
  const out: Record<string, string[]> = {};
  if (!input || typeof input !== "object") return out;
  const entries = Object.entries(input).slice(0, 40);
  for (const [rawKey, rawVal] of entries) {
    const key = String(rawKey).trim().slice(0, 65);
    if (!key) continue;

    // Avoid sending an aspect that conflicts with top-level condition
    if (/^condition$|^item\s*condition$/i.test(key)) continue;

    const arr = toStringArray(rawVal);
    if (arr.length) out[key] = arr;
  }
  return out;
}


function getId(obj: any): string {
  return obj?.paymentPolicyId || obj?.fulfillmentPolicyId || obj?.returnPolicyId || obj?.id || "";
}

function isLocalPickupOnly(fp: FulfillmentPolicy | undefined | null): boolean {
  if (!fp) return false;
  if (fp.localPickup === true) return true;
  const opts = fp.shippingOptions || [];
  const hasCarrier =
    opts.find((o) => (o.type || "").toUpperCase() === "SHIPPING" && (o.services?.length || 0) > 0) !=
    null;
  const hasPickup =
    opts.find((o) => (o.type || "").toUpperCase() === "PICKUP" || o.localPickup === true) != null;
  return hasPickup && !hasCarrier;
}

/** Extract offerId from an ebayFetch error string (last JSON blob) */
function parseOfferIdFromErrorMessage(msg: string | undefined | null): string | null {
  if (!msg) return null;
  const jsonStart = msg.indexOf("{\"errors\"");
  if (jsonStart >= 0) {
    try {
      const json = JSON.parse(msg.slice(jsonStart));
      const p = json?.errors?.[0]?.parameters;
      if (Array.isArray(p)) {
        const hit = p.find((x: any) => (x?.name || "").toLowerCase() === "offerid");
        if (hit?.value) return String(hit.value);
      }
    } catch {}
  }
  const m = /"offerId"\s*:\s*"(\d+)"/i.exec(msg) || /offerId[^\d]+(\d{6,})/i.exec(msg);
  return m?.[1] ? String(m[1]) : null;
}

function prettyEnumLabel(s: string | number | undefined) {
  if (s == null) return "";
  // Ensure we get a string, replace underscores with spaces, convert to lowercase, then title-case each word.
  return String(s).replace(/_/g," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
}


function getCondId(c: any): number | undefined {
  const raw = c?.id ?? c?.conditionId ?? c?.condition?.id ?? c?.value ?? c?.conditionValueId;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Always returns clean {id, enumVal, label} (label never 'undefined') */
async function getAllowedConditions(
  marketplaceId: string,
  categoryId: string
): Promise<Array<{id:number; enumVal:string; label:string}>> {
  const res: any = await getItemConditionPolicies({ marketplaceId, categoryId });
  const raw: any[] = Array.isArray(res?.itemConditionPolicies?.[0]?.itemConditions)
    ? res.itemConditionPolicies[0].itemConditions
    : [];

  const out: Array<{id:number; enumVal:string; label:string}> = [];
  for (const c of raw) {
    const id = getCondId(c);
    if (id === undefined) continue;
    const enumVal = CONDITION_ID_TO_ENUM[id];
    if (!enumVal) continue;
    const label =
      (typeof c?.displayName === "string" && c.displayName.trim()) ||
      (id === 3000 ? "Used" : prettyEnumLabel(enumVal)) ||
      String(id);
    out.push({ id, enumVal, label });
  }

  // Fallback if eBay returns nothing (rare)
  if (!out.length) {
    for (const id of [1000,3000,5000,6000,7000]) {
      const enumVal = CONDITION_ID_TO_ENUM[id];
      const label = id === 3000 ? "Used" : prettyEnumLabel(enumVal);
      if (enumVal) out.push({ id, enumVal, label });
    }
  }
  return out;
}


// robustly extract numeric condition id from possible shapes


function conditionEnumToId(enumVal: string): number | undefined {
  for (const [id, en] of Object.entries(CONDITION_ID_TO_ENUM)) {
    if (en === enumVal) return Number(id);
  }
  return undefined;
}

// Inventory API accepts exactly these enums
const INVENTORY_CONDITIONS = new Set([
  "NEW","NEW_OTHER","NEW_WITH_DEFECTS",
  "CERTIFIED_REFURBISHED","EXCELLENT_REFURBISHED","VERY_GOOD_REFURBISHED","GOOD_REFURBISHED","SELLER_REFURBISHED","LIKE_NEW",
  "USED","USED_EXCELLENT","USED_VERY_GOOD","USED_GOOD","USED_ACCEPTABLE",
  "FOR_PARTS_OR_NOT_WORKING",
]);

function normalizeInventoryCondition(v?: string): string | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const upper = s.toUpperCase().replace(/\s+/g, " ").trim();
  if (INVENTORY_CONDITIONS.has(upper)) return upper;

  const alias: Record<string,string> = {
    "OPEN BOX":"NEW_OTHER","NEW OTHER":"NEW_OTHER","NEW WITH DEFECTS":"NEW_WITH_DEFECTS",
    "FOR PARTS":"FOR_PARTS_OR_NOT_WORKING","PARTS":"FOR_PARTS_OR_NOT_WORKING",
    "VERY GOOD":"USED_VERY_GOOD","GOOD":"USED_GOOD","ACCEPTABLE":"USED_ACCEPTABLE",
    "USED":"USED","USED EXCELLENT":"USED_EXCELLENT",
  };
  const mapped = alias[upper] || upper.replace(/\s+/g,"_");
  return INVENTORY_CONDITIONS.has(mapped) ? mapped : null;
}

/** Ensure the picked condition is allowed for the selected category */
async function ensureConditionAllowedForCategory(
  marketplaceId: string,
  categoryId: string,
  enumVal: string
) {
  const res: any = await getItemConditionPolicies({ marketplaceId, categoryId });
  const raw: any[] = Array.isArray(res?.itemConditionPolicies?.[0]?.itemConditions)
    ? res.itemConditionPolicies[0].itemConditions
    : [];

  const allowedIds = new Set<number>();
  const allowedLabels: string[] = [];

  for (const c of raw) {
    const id = getCondId(c);
    if (id === undefined) continue;
    allowedIds.add(id);
    const label =
      (c?.displayName && String(c.displayName).trim()) ||
      prettyEnumLabel(CONDITION_ID_TO_ENUM[id]) ||
      String(id);
    if (label) allowedLabels.push(label);
  }

  const chosenId = conditionEnumToId(enumVal);

  // Special case: if coercing to USED_GOOD and 3000 is allowed, force pass
  if (enumVal === "USED_GOOD" && allowedIds.has(3000)) {
    console.log('Forcing validation pass for coerced USED_GOOD');
    return;
  }

  if (!chosenId || !allowedIds.has(chosenId)) {
    const msg =
      allowedLabels.length > 0
        ? `Allowed: ${allowedLabels.join(", ")}.`
        : "No condition list returned by eBay for this category.";
    throw new Error(
      `Condition "${prettyEnumLabel(enumVal)}" is not allowed for category ${categoryId}. ${msg}`
    );
  }
}

async function fetchConditionOptions(
  marketplaceId: string,
  categoryId: string
): Promise<Array<{ id: number; label: string; enumVal: string }>> {
  try {
    const res: any = await getItemConditionPolicies({ marketplaceId, categoryId });
    const raw: any[] = Array.isArray(res?.itemConditionPolicies?.[0]?.itemConditions)
      ? res.itemConditionPolicies[0].itemConditions
      : [];

    const items = raw
      .map((c) => {
        const idRaw =
          c?.id ?? c?.conditionId ?? c?.condition?.id ?? c?.value ?? c?.conditionValueId;
        const id = Number(idRaw);
        if (!Number.isFinite(id)) return null;

        const enumVal = CONDITION_ID_TO_ENUM[id];
        if (!enumVal) return null;

        const ebayLabel = c?.displayName && String(c.displayName).trim();
        const label =
          id === 3000
            ? "Used"
            : ebayLabel ||
              prettyEnumLabel(enumVal) ||
              String(id);

        return { id, label, enumVal };
      })
      .filter(Boolean) as Array<{ id: number; label: string; enumVal: string }>;

    // Filter out generic USED (ID 3000) if specific used grades are available
    const hasSpecificUsed = items.some((item) => /^USED_/.test(item.enumVal) && item.id !== 3000);
    const filteredItems = hasSpecificUsed
      ? items.filter((item) => item.id !== 3000)
      : items;

    console.log(`Fetched condition options for category ${categoryId}:`, filteredItems);

    if (filteredItems.length) return filteredItems;
  } catch (e) {
    console.error("Failed to fetch condition options for category:", e);
  }

  // Fallback shortlist (avoid generic USED if possible)
  const fallback = [
    { id: 1000, enumVal: "NEW", label: "New" },
    { id: 5000, enumVal: "USED_GOOD", label: "Used Good" },
    { id: 4000, enumVal: "USED_VERY_GOOD", label: "Used Very Good" },
    { id: 6000, enumVal: "USED_ACCEPTABLE", label: "Used Acceptable" },
    { id: 7000, enumVal: "FOR_PARTS_OR_NOT_WORKING", label: "For Parts or Not Working" },
  ];
  return fallback;
}


function ConditionSelect(props: {
  marketplaceId: string;
  categoryId: string;
  value: string;
  onChange: (v: string) => void;
  notes: string;
  onChangeNotes: (v: string) => void;
}) {
  const { marketplaceId, categoryId, value, onChange, notes, onChangeNotes } = props;
  const [options, setOptions] = useState<ConditionOption[]>([]);

  useEffect(() => {
    let alive = true;
    const id = (categoryId || "").trim();
    if (!id) {
      setOptions([]);
      return;
    }
    fetchConditionOptions(marketplaceId, id)
      .then((opts) => {
        if (!alive) return;
        setOptions(opts);
        console.log(`Condition options for category ${id}:`, opts);

        // If current value is not allowed or is generic USED (3000) with specific grades available
        const isCurrentValueAllowed = opts.find((o) => o.enumVal === value);
        const isGenericUsed = value === "USED" || conditionEnumToId(value) === 3000;
        const hasSpecificUsed = opts.some((o) => /^USED_/.test(o.enumVal) && o.id !== 3000);

        let preferred = opts[0];

        if (!isCurrentValueAllowed || (isGenericUsed && hasSpecificUsed)) {
          // Prioritize specific used grades
          preferred =
            opts.find((o) => o.enumVal === "USED_GOOD") ||
            opts.find((o) => o.enumVal === "USED_VERY_GOOD") ||
            opts.find((o) => o.enumVal === "USED_ACCEPTABLE") ||
            opts[0];

          if (preferred && preferred.enumVal !== value) {
            console.log(`Coercing condition from ${value} to ${preferred.enumVal}`);
            onChange(preferred.enumVal);
          }
        }
      })
      .catch((e) => {
        console.error("Failed to fetch condition options:", e);
        setOptions([
          { id: 1000, enumVal: "NEW", label: "New" },
          { id: 5000, enumVal: "USED_GOOD", label: "Used Good" },
          { id: 4000, enumVal: "USED_VERY_GOOD", label: "Used Very Good" },
          { id: 6000, enumVal: "USED_ACCEPTABLE", label: "Used Acceptable" },
          { id: 7000, enumVal: "FOR_PARTS_OR_NOT_WORKING", label: "For Parts or Not Working" },
        ]);
      });
    return () => {
      alive = false;
    };
  }, [marketplaceId, categoryId, value, onChange]);

  return (
    <>
      <div className="mb-2 text-xs font-semibold opacity-80">CONDITION</div>
      <select
        className="mb-2 h-9 w-full rounded border px-2 text-sm dark:bg-gray-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.length === 0 && (
          <option value="">Loading conditions...</option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.enumVal}>
            {o.label}
          </option>
        ))}
      </select>

      {!/^NEW/.test(value) && (
        <textarea
          value={notes}
          onChange={(e) => onChangeNotes(e.target.value)}
          rows={Math.min(6, Math.max(2, Math.ceil((notes || "").length / 80)))}
          className="w-full resize-y rounded border p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          placeholder="Condition notes (scratches, battery health, etc.)"
        />
      )}
    </>
  );
}

function buildInventoryItemBody(args: {
  sku: string;
  title: string;
  description: string;
  aspects: Record<string, string[]>;
  imageUrls: string[];
  quantity: number;
  conditionEnum: string; // e.g. "USED_GOOD"
  conditionNotes?: string; // only for non-NEW conditions
  weightValue: number;
  weightUnit: typeof WEIGHT_UNITS[number];
  length?: number;
  width?: number;
  height?: number;
  dimUnit?: typeof DIM_UNITS[number];
}) {
  const {
    sku,
    title,
    description,
    aspects,
    imageUrls,
    quantity,
    conditionEnum,
    conditionNotes,
    weightValue,
    weightUnit,
    length,
    width,
    height,
    dimUnit,
  } = args;

  const body: any = {
    sku,
    condition: conditionEnum,
    product: {
      title: title.trim(),
      description: description.trim(),
      aspects,
      imageUrls,
    },
    availability: {
      shipToLocationAvailability: { quantity },
    },
    packageWeightAndSize: {
      weight: { value: Number(weightValue), unit: weightUnit },
    },
  };

  if (!/^NEW/.test(conditionEnum) && (conditionNotes || "").trim()) {
    body.conditionDescription = String(conditionNotes).trim();
  }

  const hasDims =
    Number(length) > 0 && Number(width) > 0 && Number(height) > 0 && !!dimUnit;
  if (hasDims) {
    body.packageWeightAndSize.dimensions = {
      length: Number(length),
      width: Number(width),
      height: Number(height),
      unit: dimUnit,
    };
  }

  return body;
}
/* ───────────────────────────── useReducer ────────────────────────── */

type FormState = {
  merchantLocationKey: string;
  title: string;
  sku: string;
  categoryId: string;
  aspects: AspectsMap;
  condition: string;
  conditionDesc: string;
  price: string;
  qty: string;
  allowOffers: boolean;
  description: string;
  weightValue: string;
  weightUnit: typeof WEIGHT_UNITS[number];
  length: string;
  width: string;
  height: string;
  dimUnit: typeof DIM_UNITS[number];
  paymentPolicyId: string;
  fulfillPolicyId: string;
  returnPolicyId: string;
  photos: Photo[];
  importSource: string;
};

type FormAction =
  | { type: "SET_FIELD"; field: keyof Omit<FormState, "aspects" | "photos">; value: any }
  | { type: "SET_ASPECT"; name: string; value: string }
  | { type: "SET_ASPECTS"; aspects: AspectsMap }
  | { type: "SET_PHOTOS"; photos: Photo[] }
  | { type: "ADD_PHOTO"; url: string }
  | { type: "REMOVE_PHOTO"; index: number }
  | { type: "SET_ALL"; state: Partial<FormState> };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_ASPECT": {
      const next = { ...state.aspects };
      if (!action.value) delete next[action.name];
      else next[action.name] = action.value;
      return { ...state, aspects: next };
    }
    case "SET_ASPECTS":
      return { ...state, aspects: action.aspects };
    case "SET_PHOTOS":
      return { ...state, photos: action.photos };
    case "ADD_PHOTO":
      if (!action.url || state.photos.some((p) => p.url === action.url))
        return state;
      return { ...state, photos: [...state.photos, { url: action.url }] };
    case "REMOVE_PHOTO":
      return {
        ...state,
        photos: state.photos.filter((_, i) => i !== action.index),
      };
    case "SET_ALL":
        return { ...state, ...action.state };
    default:
      return state;
  }
}

function getInitialState(row: InventoryRow): FormState {
  const initialCat: string = (() => {
    const a = (row as any).ebayCategoryId ?? undefined;
    const b = Number.isFinite(Number((row as any).categoryId))
      ? String((row as any).categoryId)
      : undefined;
    const c = DEFAULT_CAT || undefined;
    return (a ?? b ?? c) ?? "";
  })();

  const photos: Photo[] = Array.isArray((row as any)?.images)
    ? ((row as any).images as string[]).map((url) => ({ url }))
    : Array.isArray((row as any)?.photos)
    ? ((row as any).photos as string[]).map((url) => ({ url }))
    : [];

  const aspects: AspectsMap = (() => {
    const fromSpecs = (row.specs || {}) as Record<string, any>;
    const m: AspectsMap = {};
    for (const k of Object.keys(fromSpecs)) {
      if (fromSpecs[k] != null && fromSpecs[k] !== "") {
        m[String(k)] = String(fromSpecs[k]);
      }
    }
    return m;
  })();

  const description: string = [
    row.productName,
    row.grade ? `Grade ${row.grade}` : "",
    row.testerComment ? `Notes: ${row.testerComment}` : "",
  ]
    .filter(Boolean)
    .join("\n");


  return {
    merchantLocationKey: DEFAULT_MLK,
    title: row.productName || row.synergyId,
    sku: (row as any).sku || "",
    categoryId: initialCat,
    aspects,
    condition: "", // Set by ConditionSelect effect
    conditionDesc: (row.testerComment || "").trim(),
    price: String(
        typeof row.ebayPrice === "number"
        ? row.ebayPrice
        : typeof row.price === "number"
        ? row.price
        : ""
    ),
    qty: String((row as any).quantity ?? 1),
    allowOffers: false,
    description,
    weightValue: "",
    weightUnit: "POUND",
    length: "",
    width: "",
    height: "",
    dimUnit: "INCH",
    paymentPolicyId: "",
    fulfillPolicyId: "",
    returnPolicyId: "",
    photos,
    importSource: "",
  };
}


/* ───────────────────────────── component ─────────────────────────── */

export default function ListingWizardModal({
  open,
  onOpenChange,
  row,
  onPosted,
}: Props) {
  if (!open) return null;

  const [formState, dispatch] = useReducer(formReducer, row, getInitialState);
  const {
    merchantLocationKey,
    title,
    sku,
    categoryId,
    aspects,
    condition,
    conditionDesc,
    price,
    qty,
    allowOffers,
    description,
    weightValue,
    weightUnit,
    length,
    width,
    height,
    dimUnit,
    paymentPolicyId,
    fulfillPolicyId,
    returnPolicyId,
    photos,
    importSource,
  } = formState;

  const [categorySuggests, setCategorySuggests] = useState<
    { id: string; name: string }[]
  >([]);
  const [requiredAspects, setRequiredAspects] = useState<string[]>([]);

  const [paymentPolicies, setPaymentPolicies] = useState<PaymentPolicy[]>([]);
  const [fulfillmentPolicies, setFulfillmentPolicies] = useState<FulfillmentPolicy[]>([]);
  const [returnPolicies, setReturnPolicies] = useState<ReturnPolicy[]>([]);
  const [locations, setLocations] = useState<
    Array<{ merchantLocationKey: string; name?: string }>
  >([]);

  const selectedPayment = useMemo(
    () => paymentPolicies.find((p) => getId(p) === paymentPolicyId),
    [paymentPolicies, paymentPolicyId]
  );
  const selectedFulfillment = useMemo(
    () => fulfillmentPolicies.find((p) => getId(p) === fulfillPolicyId),
    [fulfillmentPolicies, fulfillPolicyId]
  );
  const selectedReturn = useMemo(
    () => returnPolicies.find((p) => getId(p) === returnPolicyId),
    [returnPolicies, returnPolicyId]
  );

  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ───────────────────────────── effects ─────────────────────────── */

  // Policy & Location fetch
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        let payload: any;
        if (typeof _getPoliciesByMarketplace === "function") {
          payload = await _getPoliciesByMarketplace(MARKETPLACE_ID);
        } else if (typeof _getPoliciesFallback === "function") {
          payload = await _getPoliciesFallback();
        }
        if (!on) return;

        const payments: PaymentPolicy[] =
          payload?.payment?.paymentPolicies ||
          payload?.payment?.policies ||
          payload?.payment ||
          [];
        const fulfills: FulfillmentPolicy[] =
          payload?.fulfillment?.fulfillmentPolicies ||
          payload?.fulfillment?.policies ||
          payload?.fulfillment ||
          [];
        const returns: ReturnPolicy[] =
          payload?.return?.returnPolicies ||
          payload?.return?.policies ||
          payload?.return ||
          [];

        setPaymentPolicies(payments);
        setFulfillmentPolicies(fulfills);
        setReturnPolicies(returns);

        const updates: Partial<FormState> = {};
        if (payments[0] && !paymentPolicyId) updates.paymentPolicyId = getId(payments[0]);
        if (fulfills[0] && !fulfillPolicyId) updates.fulfillPolicyId = getId(fulfills[0]);
        if (returns[0] && !returnPolicyId) updates.returnPolicyId = getId(returns[0]);

        if (Object.keys(updates).length) dispatch({ type: "SET_ALL", state: updates });
      } catch {
        // leave selectors empty; the UI will still block publish with a helpful error
      }
    })();
    return () => {
      on = false;
    };
  }, [paymentPolicyId, fulfillPolicyId, returnPolicyId]);

  useEffect(() => {
    let on = true;
    const id = (categoryId || "").trim();
    if (!id) {
      setRequiredAspects([]);
      return;
    }
    getAspects(id)
      .then((spec: any) => {
        if (!on) return;
        const reqNames =
          spec?.aspects
            ?.filter((a: any) => a?.aspectConstraint?.aspectRequired)
            ?.map((a: any) => String(a?.localizedAspectName || a?.aspectName))
            ?.filter(Boolean) || [];
        setRequiredAspects(reqNames);
      })
      .catch(() => setRequiredAspects([]));
    return () => {
      on = false;
    };
  }, [categoryId]);

  useEffect(() => {
    let on = true;
    getInventoryLocations()
      .then((r: any) => {
        if (!on) return;
        const list: Array<{ merchantLocationKey: string; name?: string }> = [];
        if (Array.isArray(r?.locations)) {
          for (const loc of r.locations) {
            const key =
              loc?.merchantLocationKey ||
              loc?.merchantlocationkey ||
              loc?.key;
            if (key) list.push({ merchantLocationKey: String(key), name: loc?.name });
          }
        } else if (Array.isArray(r?.locationResponses)) {
          for (const loc of r.locationResponses) {
            const key = loc?.merchantLocationKey;
            if (key) list.push({ merchantLocationKey: String(key), name: loc?.name });
          }
        } else if (r?.merchantLocationKey) {
          list.push({
            merchantLocationKey: String(r.merchantLocationKey),
            name: r?.name,
          });
        }
        setLocations(list);
        if (!merchantLocationKey && list[0]?.merchantLocationKey) {
          dispatch({ type: "SET_FIELD", field: "merchantLocationKey", value: list[0].merchantLocationKey });
        }
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [merchantLocationKey]); // once

  /* ───────────────────────────── actions ─────────────────────────── */

  const doSuggestCategory = useCallback(async () => {
    setErr(null);
    setCategorySuggests([]);
    const q = (title || row.productName || "").trim();
    if (!q) return;
    try {
      const out = await getCategorySuggestions(q);
      const picks =
        out?.categorySuggestions?.map((c: any) => ({
          id: String(c?.category?.categoryId || ""),
          name: String(c?.category?.categoryName || ""),
        })) || [];
      setCategorySuggests(picks);
      if (picks[0]?.id) dispatch({ type: "SET_FIELD", field: "categoryId", value: picks[0].id });
    } catch (e: any) {
      setErr(e?.message || "Failed to get suggestions");
    }
  }, [title, row.productName]);

  const addPhotoUrl = useCallback((url: string) => {
    const u = (url || "").trim();
    if (!u) return;
    dispatch({ type: "ADD_PHOTO", url: u });
  }, []);

  const removePhoto = useCallback((idx: number) => {
    dispatch({ type: "REMOVE_PHOTO", index: idx });
  }, []);

  const setAspect = useCallback((name: string, value: string) => {
    dispatch({ type: "SET_ASPECT", name, value });
  }, []);

  const importSellSimilar = useCallback(async () => {
    setErr(null);
    setImporting(true);
    try {
      const { restfulId, legacyId } = extractEbayIdFromUrl(importSource);
      let item: any | null = null;

      if (legacyId) item = await ebayGetItemByLegacyId(legacyId);
      else if (restfulId) item = await ebayGetItemById(restfulId);
      else throw new Error("Paste a valid eBay item URL or ID.");

      const urls: string[] = [];
      if (item?.image?.imageUrl) urls.push(item.image.imageUrl);
      if (Array.isArray(item?.additionalImages)) {
        for (const a of item.additionalImages) if (a?.imageUrl) urls.push(a.imageUrl);
      }
      if (urls.length) dispatch({ type: "SET_PHOTOS", photos: urls.map((url) => ({ url })) });

      const updates: Partial<FormState> = {};
      if (item?.title) updates.title = String(item.title);
      if (item?.categoryId) updates.categoryId = String(item.categoryId);

      const specifics = item?.itemSpecifics || item?.localizedAspects || [];
      const map: Record<string, string> = {};
      for (const s of specifics) {
        const name =
          s?.name || s?.localizedName || s?.aspectName || s?.localizedAspectName;
        const values = s?.values || s?.value || s?.localizedValues || [];
        const v =
          Array.isArray(values) && values.length
            ? values[0]
            : typeof values === "string"
            ? values
            : "";
        if (name && v) map[String(name)] = String(v);
      }
      if (item?.brand && !map["Brand"]) map["Brand"] = String(item.brand);
      dispatch({ type: "SET_ALL", state: updates });
      dispatch({ type: "SET_ASPECTS", aspects: { ...map, ...aspects } });

    } catch (e: any) {
      setErr(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }, [importSource, aspects]);

  const validate = useCallback((): string | null => {
    if (!title.trim()) return "Add a title.";
    if (!(categoryId || "").trim()) return "Choose a category.";
    if (!sku.trim()) return "Enter a SKU (e.g., 102 SURFACE - STOCK SHELF).";
    for (const name of requiredAspects) {
      if (!aspects[name]) return `Missing required specific: ${name}`;
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return "Enter a valid price.";
    const qtyNum = Number(qty);
    if (!Number.isInteger(qtyNum) || qtyNum < 1) return "Quantity must be >= 1.";
    if (!paymentPolicyId || !fulfillPolicyId || !returnPolicyId) {
      return "Select Payment, Shipping (Fulfillment), and Return policies.";
    }
    if (!merchantLocationKey) {
      return "Select an Inventory Location (Merchant Location Key).";
    }
    // Require valid package weight
    const w = Number(weightValue);
    if (!Number.isFinite(w) || w <= 0) {
      return "Enter a valid package weight (e.g., 2.5).";
    }
    if (!WEIGHT_UNITS.includes(weightUnit)) {
      return "Pick a valid weight unit.";
    }
    // Dimensions optional; but if any provided, require all + unit
    const dimsProvided = [length, width, height].some((x) => String(x || "").trim() !== "");
    if (dimsProvided) {
      const L = Number(length),
        W = Number(width),
        H = Number(height);
      if (![L, W, H].every((n) => Number.isFinite(n) && n > 0)) {
        return "If you enter dimensions, provide positive numbers for length, width, and height.";
      }
      if (!DIM_UNITS.includes(dimUnit)) {
        return "Pick a valid dimensions unit.";
      }
    }

    const pickupOnly = isLocalPickupOnly(selectedFulfillment);
    const immediatePay = !!selectedPayment?.immediatePay;
    if (pickupOnly && immediatePay) {
      return "Policy conflict: Local Pickup only + Immediate Payment not allowed. Change Payment policy or Shipping policy.";
    }

    const condNorm = normalizeInventoryCondition(condition);
    if (!condNorm) return "Pick a valid condition (e.g., Used, Used Good, New, etc.).";

    return null;
  }, [
    title,
    categoryId,
    sku,
    requiredAspects,
    aspects,
    price,
    qty,
    paymentPolicyId,
    fulfillPolicyId,
    returnPolicyId,
    merchantLocationKey,
    weightValue,
    weightUnit,
    length,
    width,
    height,
    dimUnit,
    selectedFulfillment,
    selectedPayment,
    condition,
  ]);

  /** Try to find an existing offerId for the SKU via API or error text parsing */
  async function resolveExistingOfferIdFromSkuOrError(
    skuVal: string,
    errorMessage?: string
  ): Promise<string | null> {
    try {
      if (typeof _getOffersBySku === "function") {
        const r: any = await _getOffersBySku(skuVal);
        const list: any[] = r?.offers || r?.offer || r?.items || [];
        const offer = Array.isArray(list)
          ? list.find((x) => x?.sku === skuVal || x?.offerId)
          : null;
        if (offer?.offerId) return String(offer.offerId);
      }
    } catch {}
    const parsed = parseOfferIdFromErrorMessage(errorMessage || "");
    return parsed || null;
  }

const handlePublish = useCallback(async () => {
  const v = validate();
  if (v) {
    setErr(v);
    return;
  }
  setBusy(true);
  setErr(null);

  try {
    // ── SKU: sanitize for the Inventory API path/body
    const safeSku =
      sku.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 50) || "SKU";
    if (safeSku !== sku) dispatch({ type: "SET_FIELD", field: "sku", value: safeSku });

    const qtyNum = Math.max(1, Number(qty) || 1);
    const priceNum = Number(price);
    const aspectsArrayMap = sanitizeAspects(aspects);

    // ── Condition: normalize and validate against category
    const uiChoice = normalizeInventoryCondition(condition) || String(condition || "").toUpperCase();
    const { finalEnum: allowedCond, allowedLabels } = await resolveAllowedCondition(
      MARKETPLACE_ID,
      categoryId.trim(),
      uiChoice
    );
    if (allowedCond !== condition) {
      console.log(`Updating condition from ${condition} to ${allowedCond}`);
      dispatch({ type: "SET_FIELD", field: "condition", value: allowedCond });
    }

    // Explicitly validate condition
    await ensureConditionAllowedForCategory(MARKETPLACE_ID, categoryId.trim(), allowedCond).catch((e) => {
      console.error("Condition validation failed:", e);
      throw new Error(`Invalid condition: ${e.message}`);
    });

    // ── Upsert inventory item
    const body = buildInventoryItemBody({
      sku: safeSku,
      title,
      description,
      aspects: aspectsArrayMap,
      imageUrls: photos.map((p) => p.url),
      quantity: qtyNum,
      conditionEnum: allowedCond,
      conditionNotes: conditionDesc,
      weightValue: Number(weightValue),
      weightUnit,
      length: length ? Number(length) : undefined,
      width: width ? Number(width) : undefined,
      height: height ? Number(height) : undefined,
      dimUnit:
        [length, width, height].every((x) => String(x || "").trim() !== "")
          ? dimUnit
          : undefined,
    });
    await upsertInventoryItem(safeSku, body);

    // ── Create or update offer
    let offerId: string | null = null;
    let offerExisted = false;

    try {
      const offer = await createOffer({
        sku: safeSku,
        marketplaceId: MARKETPLACE_ID,
        categoryId: categoryId.trim(),
        format: "FIXED_PRICE",
        merchantLocationKey,
        availableQuantity: qtyNum,
        listingDescription: description.trim() || undefined,
        pricingSummary: { price: { value: priceNum, currency: "USD" } },
        listingPolicies: {
          paymentPolicyId,
          fulfillmentPolicyId: fulfillPolicyId,
          returnPolicyId,
        },
        ...(allowOffers ? { bestOfferTerms: [{ /* reserved */ }] } : {}),
        inventoryLocationKey: merchantLocationKey,
      } as any);
      offerId = (offer as any)?.offerId ?? (offer as any)?.id ?? null;
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("Offer entity already exists") || msg.includes('"errorId":25002')) {
        const existing = await resolveExistingOfferIdFromSkuOrError(safeSku, msg);
        if (!existing) throw new Error("Offer already exists for this SKU, but could not resolve offerId.");
        offerId = existing;
        offerExisted = true;
      } else {
        throw e;
      }
    }

    if (!offerId) throw new Error("No offerId returned or resolved.");

    if (offerExisted) {
      await updateOffer(String(offerId), {
        sku: safeSku,
        marketplaceId: MARKETPLACE_ID,
        categoryId: categoryId.trim(),
        format: "FIXED_PRICE",
        merchantLocationKey,
        availableQuantity: qtyNum,
        listingDescription: description.trim() || undefined,
        pricingSummary: { price: { value: priceNum, currency: "USD" } },
        listingPolicies: {
          paymentPolicyId,
          fulfillmentPolicyId: fulfillPolicyId,
          returnPolicyId,
        },
        inventoryLocationKey: merchantLocationKey,
      });
    }

    // ── Publish
    try {
      await publishOffer(String(offerId));
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (!/already\s+published|already\s+active/i.test(msg)) throw e;
    }

    onPosted?.();
    onOpenChange(false);
  } catch (e: any) {
    setErr(e?.message || "Publish failed");
  } finally {
    setBusy(false);
  }
}, [
  validate,
  sku,
  qty,
  price,
  aspects,
  condition,
  categoryId,
  title,
  description,
  photos,
  conditionDesc,
  weightValue,
  weightUnit,
  length,
  width,
  height,
  dimUnit,
  merchantLocationKey,
  paymentPolicyId,
  fulfillPolicyId,
  returnPolicyId,
  allowOffers,
  onPosted,
  onOpenChange,
]);




  /* ───────────────────────────── UI ──────────────────────────────── */


  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2"
      )}
      role="dialog"
      aria-modal="true"
    >
      {/* Increased max-width and max-height for more content */}
      <div className="relative w-[1200px] max-w-[98vw] max-h-[95vh] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between border-b px-4 py-3 dark:border-gray-700 flex-shrink-0">
          <div className="text-sm font-semibold">Complete your listing</div>
          <Button
            variant="ghost"
            className="h-8 px-3 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>

        {/* body (two columns) */}
        <div className="overflow-y-auto p-4 flex-grow grid md:grid-cols-[2fr_1fr] gap-4">

          {/* LEFT COLUMN: Core Details, Description, Aspects */}
          <div className="space-y-4">
            {/* Title / SKU */}
            <section className="rounded-lg border p-4 dark:border-gray-700">
              <div className="mb-2 text-xs font-semibold opacity-80">
                TITLE & SKU
              </div>
              <Input
                value={title}
                onChange={(e) => dispatch({ type: "SET_FIELD", field: "title", value: e.target.value })}
                placeholder="Item title"
                className="mb-2"
              />
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <div className="text-[11px] opacity-70">Custom label (SKU)</div>
                <Input
                  value={sku}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "sku", value: e.target.value })}
                  placeholder="e.g. 102 SURFACE - STOCK SHELF"
                />
              </div>
              <div className="mt-1 text-[11px] opacity-60">
                This is what eBay stores as your SKU/Custom Label.
              </div>
            </section>

            {/* Photos (moved to left column, still at the top) */}
            <section className="rounded-lg border p-4 dark:border-gray-700">
                <div className="mb-2 text-xs font-semibold opacity-80">PHOTOS</div>
                <div className="flex flex-wrap gap-2">
                    {photos.slice(0, 10).map((p, i) => ( // Limit to 10 for visibility
                        <div
                            key={`${p.url}-${i}`}
                            className="relative h-16 w-16 overflow-hidden rounded border dark:border-gray-700"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={p.url}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                            />
                            <button
                                type="button"
                                className="absolute right-0 top-0 rounded-bl bg-black/60 px-1 py-0.5 text-[8px] text-white leading-none"
                                onClick={() => removePhoto(i)}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    <div className="flex-1 min-w-[200px] flex flex-col justify-center">
                        <div className="flex gap-2">
                            <Input
                                placeholder="https://… (paste image URL here)"
                                className="h-8 text-xs"
                                onKeyDown={(e) => {
                                    const t = e.currentTarget;
                                    if (e.key === "Enter") {
                                        addPhotoUrl(t.value);
                                        t.value = "";
                                    }
                                }}
                            />
                            <Button
                                variant="secondary"
                                className="h-8 text-xs px-2"
                                onClick={() => {
                                    const activeEl = document.activeElement as HTMLInputElement;
                                    const val = activeEl?.value;
                                    if (val) {
                                        addPhotoUrl(val);
                                        activeEl.value = "";
                                    }
                                }}
                            >
                                Add
                            </Button>
                        </div>
                        <div className="mt-1 text-[10px] opacity-70">
                            You have {photos.length} photos. Tip: paste URLs separated by spaces/lines and hit Enter.
                        </div>
                    </div>
                </div>
            </section>

            {/* Condition & Description */}
            <section className="rounded-lg border p-4 dark:border-gray-700">
                <div className="grid grid-cols-2 gap-4">
                    {/* Condition (left half) */}
                    <div>
                        <ConditionSelect
                            marketplaceId={MARKETPLACE_ID}
                            categoryId={categoryId}
                            value={condition}
                            onChange={(v) => dispatch({ type: "SET_FIELD", field: "condition", value: v })}
                            notes={conditionDesc}
                            onChangeNotes={(v) => dispatch({ type: "SET_FIELD", field: "conditionDesc", value: v })}
                        />
                    </div>
                    {/* Description (right half) */}
                    <div>
                        <div className="mb-2 text-xs font-semibold opacity-80">
                            DESCRIPTION
                        </div>
                        <textarea
                            value={description}
                            onChange={(e) => dispatch({ type: "SET_FIELD", field: "description", value: e.target.value })}
                            rows={textareaRows(description)}
                            className="w-full resize-y rounded border p-2 text-sm dark:border-gray-700 dark:bg-gray-900 min-h-[160px]"
                        />
                    </div>
                </div>
            </section>

            {/* Item specifics */}
            <section className="rounded-lg border p-4 dark:border-gray-700">
              <div className="mb-2 text-xs font-semibold opacity-80">
                ITEM SPECIFICS
              </div>
              {requiredAspects.length ? (
                <div className="mb-2 text-[11px] opacity-70">
                  Required: {requiredAspects.join(", ")}
                </div>
              ) : (
                <div className="mb-2 text-[11px] opacity-60">
                  Choose a category to load required specifics
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {Object.keys(aspects).map((k) => (
                  <div
                    key={k}
                    className="grid grid-cols-[120px_1fr] items-center gap-2"
                  >
                    <Input value={k} readOnly className="h-8 text-xs bg-gray-50 dark:bg-gray-800" />
                    <Input
                      value={aspects[k]}
                      onChange={(e) => setAspect(k, e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
                <div className="grid grid-cols-[120px_1fr] items-center gap-2 pt-2">
                  <Input
                    placeholder="New Specific"
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      const name = e.currentTarget.value.trim();
                      if (e.key === "Enter" && name) {
                        if (!aspects[name]) setAspect(name, "");
                        e.currentTarget.value = "";
                      }
                    }}
                  />
                  <div className="text-[11px] opacity-60">
                    Press Enter to add; then fill the value.
                  </div>
                </div>
              </div>
            </section>

          </div>


          {/* RIGHT COLUMN: Pricing, Package, Policies, Importer */}
          <div className="space-y-4">
            {/* Category */}
            <section className="rounded-lg border p-4 dark:border-gray-700">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold opacity-80">
                  ITEM CATEGORY
                </div>
                <Button
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={doSuggestCategory}
                  >
                    Suggest from title
                  </Button>
              </div>
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <div className="text-[11px] opacity-70">Category ID</div>
                <Input
                  value={categoryId}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "categoryId", value: e.target.value })}
                  placeholder="e.g. 171485"
                />
              </div>
              {!!categorySuggests.length && (
                <div className="mt-2 flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                  {categorySuggests.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => dispatch({ type: "SET_FIELD", field: "categoryId", value: c.id })}
                      className="rounded border px-2 py-1 text-[11px] dark:border-gray-700"
                      title={c.name}
                    >
                      {c.id} — {c.name}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Pricing */}
            <section className="rounded-lg border p-4 dark:border-gray-700">
              <div className="mb-2 text-xs font-semibold opacity-80">PRICING</div>
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <div className="text-[11px] opacity-70">Format</div>
                <Input value="Buy It Now" readOnly className="h-8 text-xs" />
                <div className="text-[11px] opacity-70">Item price ($)</div>
                <Input
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "price", value: e.target.value })}
                  placeholder="0.00"
                  className="h-8 text-xs"
                />
                <div className="text-[11px] opacity-70">Quantity</div>
                <Input
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "qty", value: e.target.value })}
                  className="h-8 text-xs"
                />
                <div className="text-[11px] opacity-70">Allow offers</div>
                <div>
                  <Switch
                    checked={allowOffers}
                    onCheckedChange={(v) => dispatch({ type: "SET_FIELD", field: "allowOffers", value: v })}
                  />
                </div>
              </div>
            </section>

            {/* Package & weight (required by eBay to publish) */}
            <section className="rounded-lg border p-4 dark:border-gray-700">
              <div className="mb-2 text-xs font-semibold opacity-80">
                PACKAGE &amp; WEIGHT
              </div>

              <div className="mb-2 grid grid-cols-[120px_1fr] items-center gap-2">
                <div className="text-[11px] opacity-70">Weight</div>
                <div className="flex gap-2">
                  <Input
                    inputMode="decimal"
                    placeholder="e.g. 2.5"
                    value={weightValue}
                    onChange={(e) => dispatch({ type: "SET_FIELD", field: "weightValue", value: e.target.value })}
                    className="w-28 h-8 text-xs"
                  />
                  <select
                    className="h-8 rounded border px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    value={weightUnit}
                    onChange={(e) => dispatch({ type: "SET_FIELD", field: "weightUnit", value: e.target.value })}
                  >
                    {WEIGHT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-1 grid grid-cols-[120px_1fr] items-center gap-2">
                <div className="text-[11px] opacity-70">Dimensions</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    inputMode="decimal"
                    placeholder="L"
                    value={length}
                    onChange={(e) => dispatch({ type: "SET_FIELD", field: "length", value: e.target.value })}
                    className="w-16 h-8 text-xs"
                  />
                  <span className="text-xs opacity-60">×</span>
                  <Input
                    inputMode="decimal"
                    placeholder="W"
                    value={width}
                    onChange={(e) => dispatch({ type: "SET_FIELD", field: "width", value: e.target.value })}
                    className="w-16 h-8 text-xs"
                  />
                  <span className="text-xs opacity-60">×</span>
                  <Input
                    inputMode="decimal"
                    placeholder="H"
                    value={height}
                    onChange={(e) => dispatch({ type: "SET_FIELD", field: "height", value: e.target.value })}
                    className="w-16 h-8 text-xs"
                  />
                  <select
                    className="h-8 rounded border px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    value={dimUnit}
                    onChange={(e) => dispatch({ type: "SET_FIELD", field: "dimUnit", value: e.target.value })}
                  >
                    {DIM_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-2 text-[11px] opacity-60">
                Weight is required. Dimensions help shipping estimates (optional).
              </div>
            </section>

            {/* Policies + Inventory Location */}
            <section className="rounded-lg border p-4 dark:border-gray-700">
              <div className="mb-2 text-xs font-semibold opacity-80">POLICIES</div>

              <div className="mb-2 grid grid-cols-[120px_1fr] items-center gap-2">
                <div className="text-[11px] opacity-70">Payment</div>
                <select
                  value={paymentPolicyId}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "paymentPolicyId", value: e.target.value })}
                  className="h-8 w-full rounded border px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  {paymentPolicies.map((p) => (
                    <option key={getId(p)} value={getId(p)}>
                      {p.name || getId(p)}
                      {p.immediatePay ? " — Immediate payment" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-2 grid grid-cols-[120px_1fr] items-center gap-2">
                <div className="text-[11px] opacity-70">Shipping</div>
                <select
                  value={fulfillPolicyId}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "fulfillPolicyId", value: e.target.value })}
                  className="h-8 w-full rounded border px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  {fulfillmentPolicies.map((f) => {
                    const id = getId(f);
                    const pickupOnly = isLocalPickupOnly(f);
                    return (
                      <option key={id} value={id}>
                        {f.name || id}
                        {pickupOnly ? " — Local pickup only" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="mb-2 grid grid-cols-[120px_1fr] items-center gap-2">
                <div className="text-[11px] opacity-70">Return</div>
                <select
                  value={returnPolicyId}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "returnPolicyId", value: e.target.value })}
                  className="h-8 w-full rounded border px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  {returnPolicies.map((r) => (
                    <option key={getId(r)} value={getId(r)}>
                      {r.name || getId(r)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-1 grid grid-cols-[120px_1fr] items-center gap-2">
                <div className="text-[11px] opacity-70">Inv. Location</div>
                <select
                  value={merchantLocationKey}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "merchantLocationKey", value: e.target.value })}
                  className="h-8 w-full rounded border px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  {[{ merchantLocationKey: "", name: "— Select —" }, ...locations].map(
                    (loc) => (
                      <option
                        key={loc.merchantLocationKey || "none"}
                        value={loc.merchantLocationKey}
                      >
                        {loc.name
                          ? `${loc.name} (${loc.merchantLocationKey})`
                          : loc.merchantLocationKey || "— Select —"}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="mt-2 text-[11px] opacity-60">
                These are your eBay Business Policies & Inventory Locations.
              </div>
            </section>

            {/* Sell similar importer */}
            <section className="rounded-lg border p-4 dark:border-gray-700">
              <div className="mb-2 text-xs font-semibold opacity-80">SELL SIMILAR</div>
              <div className="mb-2 text-[11px] opacity-70">
                Paste an eBay listing URL or ID to prefill details.
              </div>
              <div className="flex gap-2">
                <Input
                  value={importSource}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "importSource", value: e.target.value })}
                  placeholder="https://www.ebay.com/itm/123456789012"
                  className="h-8 text-xs"
                />
                <Button disabled={importing} onClick={importSellSimilar} className="h-8 text-xs px-2">
                  {importing ? "Importing…" : "Import"}
                </Button>
              </div>
            </section>
          </div>
        </div>

        {/* Footer: Errors & Actions (always visible) */}
        <section className="border-t p-4 dark:border-gray-700 space-y-3 flex-shrink-0">
            {/* Errors */}
            {err && (
                <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
                    {err}
                </div>
            )}

            {/* Policy Conflict Warning (persistent if active) */}
            {(() => {
                const pickupOnly = isLocalPickupOnly(selectedFulfillment);
                const immediatePay = !!selectedPayment?.immediatePay;
                if (pickupOnly && immediatePay) {
                    return (
                        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[12px] text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                            **Policy Conflict**: Local Pickup only + Immediate Payment is not allowed. Check the **Policies** section.
                        </div>
                    );
                }
                return null;
            })()}

            {/* Actions */}
            <div className="flex items-center justify-between">
                <div className="text-[11px] opacity-70">
                    Listing to: <span className="font-medium">{MARKETPLACE_ID}</span>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={busy}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handlePublish} disabled={busy}>
                        {busy ? "Publishing…" : "List it"}
                    </Button>
                </div>
            </div>
        </section>
      </div>
    </div>
  );
}