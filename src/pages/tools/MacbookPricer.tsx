import { useState, useMemo, useEffect, useCallback } from "react";
import {
  DollarSign, ClipboardCopy, Printer, CheckCircle, Search, Laptop, Database,
  Star, MemoryStick, CpuIcon, Sun, Moon, ArrowRight, Wrench, Settings, XCircle,
  Save, Plus, Trash2, ArrowLeft
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import React from 'react';
import { openPrintWindow } from "@/helpers/printLabel";
import { API_BASE } from "@/lib/api";

// --- API helpers (PUT/GET config + MSRP lookup) ---
async function fetchServerConfig(): Promise<PricingConfig | null> {
  try {
    const r = await fetch(`${API_BASE}/pricing-config`, { cache: "no-store" });
    const j = await r.json();
    return (j?.data ?? null) as PricingConfig | null;
  } catch { return null; }
}

async function saveServerConfig(cfg: PricingConfig) {
  await fetch(`${API_BASE}/pricing-config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: cfg }),
  });
}

async function fetchMsrp(modelKey: string, year: number): Promise<number> {
  try {
    const r = await fetch(`${API_BASE}/msrp?model_key=${encodeURIComponent(modelKey)}&year=${year}`);
    const j = await r.json();
    return Number(j?.msrp ?? 999);
  } catch { return 999; }
}

// Define the shape of our data for type safety and clarity
interface BaseConfig { 
    basePrice: number;
    baseStorage: number; 
    baseRAM: number;     
    baseCPU: string;     
    cpuUpgrades: Record<string, number>; 
}

interface Modifiers {
    STORAGE_MOD_PER_256GB: number; 
    RAM_MOD_PER_8GB: number;       
}

interface PricingConfig {
    INTEL_MODIFIERS: Modifiers;
    M_SERIES_MODIFIERS: Modifiers;
    CONDITION_DEDUCTS: Record<string, number>;
    PRICING_DATA_MAP: Record<string, Record<number, BaseConfig>>;
}

const DEFAULT_PRICING_CONFIG: PricingConfig = {
    INTEL_MODIFIERS: {
        STORAGE_MOD_PER_256GB: 30,
        RAM_MOD_PER_8GB: 50,
    },
    M_SERIES_MODIFIERS: {
        STORAGE_MOD_PER_256GB: 50,
        RAM_MOD_PER_8GB: 75,
    },
    CONDITION_DEDUCTS: {
        A: 0,
        B: -20,
        C: -50,
        D: -100,
    },
    PRICING_DATA_MAP: {
        "AIR_13": {
            2017: { basePrice: 200, baseStorage: 128, baseRAM: 8, baseCPU: 'i5', cpuUpgrades: { 'i7': 75 } },
            2018: { basePrice: 275, baseStorage: 128, baseRAM: 8, baseCPU: 'i5', cpuUpgrades: {} },
            2019: { basePrice: 300, baseStorage: 256, baseRAM: 8, baseCPU: 'i5', cpuUpgrades: {} },
            2020: { basePrice: 325, baseStorage: 256, baseRAM: 8, baseCPU: 'i5', cpuUpgrades: {} }, 
        },
        "PRO_13": {
            2016: { basePrice: 250, baseStorage: 256, baseRAM: 8, baseCPU: 'i5', cpuUpgrades: { 'i7': 75 } },
            2017: { basePrice: 275, baseStorage: 256, baseRAM: 8, baseCPU: 'i5', cpuUpgrades: { 'i7': 75 } },
            2018: { basePrice: 325, baseStorage: 256, baseRAM: 8, baseCPU: 'i5', cpuUpgrades: { 'i7': 75 } },
            2019: { basePrice: 350, baseStorage: 256, baseRAM: 8, baseCPU: 'i5', cpuUpgrades: { 'i7': 75 } },
            2020: { basePrice: 400, baseStorage: 512, baseRAM: 16, baseCPU: 'i5', cpuUpgrades: { 'i7': 75 } },
        },
        "PRO_15": {
            2016: { basePrice: 350, baseStorage: 256, baseRAM: 16, baseCPU: 'i7', cpuUpgrades: {} }, 
            2017: { basePrice: 375, baseStorage: 256, baseRAM: 16, baseCPU: 'i7', cpuUpgrades: {} },
            2018: { basePrice: 400, baseStorage: 256, baseRAM: 16, baseCPU: 'i7', cpuUpgrades: { 'i9': 125 } },
            2019: { basePrice: 450, baseStorage: 256, baseRAM: 16, baseCPU: 'i7', cpuUpgrades: { 'i9': 125 } },
        },
        "PRO_16": {
            2019: { basePrice: 500, baseStorage: 512, baseRAM: 16, baseCPU: 'i7', cpuUpgrades: { 'i9': 125 } },
        },
        "AIR_13_M1": {
            2020: { basePrice: 400, baseStorage: 256, baseRAM: 8, baseCPU: 'M1', cpuUpgrades: {} },
        },
        "AIR_13_M2": {
            2022: { basePrice: 550, baseStorage: 256, baseRAM: 8, baseCPU: 'M2', cpuUpgrades: {} },
        },
        "PRO_13_M": {
            2020: { basePrice: 450, baseStorage: 256, baseRAM: 8, baseCPU: 'M1', cpuUpgrades: {} },
            2022: { basePrice: 600, baseStorage: 256, baseRAM: 8, baseCPU: 'M2', cpuUpgrades: {} },
        },
        "PRO_14_M": {
            2021: { basePrice: 1100, baseStorage: 512, baseRAM: 16, baseCPU: 'M1 Pro', cpuUpgrades: { 'M1 Max': 250 } },
        },
        "PRO_16_M": {
            2021: { basePrice: 1300, baseStorage: 512, baseRAM: 16, baseCPU: 'M1 Pro', cpuUpgrades: { 'M1 Max': 250 } },
        },
    }
};

// Available configuration options
const RAM_OPTIONS: number[] = [4, 8, 16, 32, 64];
const STORAGE_OPTIONS: number[] = [64, 128, 256, 512, 1024, 2048, 4096];

// Special fixed-price models (already implemented as requested)
const SPECIAL_KEYS = {
  AIR_MAGS1: "AIR_MAGS1",
  AIR_2012_2016: "AIR_2012_2016",
  PRO_2012_2015: "PRO_2012_2015",
} as const;

const SPECIAL_FIXED_PRICE: Record<string, number> = {
  [SPECIAL_KEYS.AIR_MAGS1]: 100,     // MacBook Air MagSafe 1: $100
  [SPECIAL_KEYS.AIR_2012_2016]: 150, // MacBook Air 2012–2016: $150
  [SPECIAL_KEYS.PRO_2012_2015]: 175, // MacBook Pro 2012–2015: $175
};

// NEW: simple CPU choices for fixed buckets (labeling only; $0 impact)
const SPECIAL_CPU_OPTIONS: Record<string, string[]> = {
  [SPECIAL_KEYS.AIR_MAGS1]: ["i5", "i7"],
  [SPECIAL_KEYS.AIR_2012_2016]: ["i5", "i7"],
  [SPECIAL_KEYS.PRO_2012_2015]: ["i5", "i7"], // covers common 13/15 combos
};

// NEW: screen size choices (label-only; $0 impact)
const SPECIAL_SIZE_OPTIONS: Record<string, number[]> = {
  [SPECIAL_KEYS.AIR_MAGS1]: [11, 13],
  [SPECIAL_KEYS.AIR_2012_2016]: [11, 13],
  [SPECIAL_KEYS.PRO_2012_2015]: [13, 15],
};

const isSpecialKey = (key: string | null) =>
  !!key && Object.prototype.hasOwnProperty.call(SPECIAL_FIXED_PRICE, key);

// User-facing Model Tiles
const MODEL_TILES = [
  // SPECIAL SELECTORS (show first, as requested)
  { key: SPECIAL_KEYS.AIR_MAGS1,     title: "Air MagSafe 1", range: "10–11", years: [2010, 2011] },
  { key: SPECIAL_KEYS.AIR_2012_2016, title: "Air 2012–2016", range: "12–16", years: [2012, 2013, 2014, 2015, 2016] },
  { key: SPECIAL_KEYS.PRO_2012_2015, title: "Pro 2012–2015", range: "12–15", years: [2012, 2013, 2014, 2015] },
  // Intel
  { key: "AIR_13", title: "Air 13 (Intel)", range: "17–20", years: [2017, 2018, 2019, 2020] },
  { key: "PRO_13", title: "Pro 13 (Intel)", range: "16–20", years: [2016, 2017, 2018, 2019, 2020] },
  { key: "PRO_15", title: "Pro 15 (Intel)", range: "16–19", years: [2016, 2017, 2018, 2019] },
  { key: "PRO_16", title: "Pro 16 (Intel)", range: "2019", years: [2019] },
  // M-Series
  { key: "AIR_13_M1", title: "Air 13 (M1)", range: "2020", years: [2020] },
  { key: "AIR_13_M2", title: "Air 13.6 (M2)", range: "2022", years: [2022] },
  { key: "PRO_13_M", title: "Pro 13 (M1/M2)", range: "20–22", years: [2020, 2022] },
  { key: "PRO_14_M", title: "Pro 14 (M1 Pro/Max)", range: "2021", years: [2021] },
  { key: "PRO_16_M", title: "Pro 16 (M1 Pro/Max)", range: "2021", years: [2021] },
];

type LabelPreviewResponse = {
  productName: string;
  unitPrice: string;
  ourPrice: string;
  date: string;
};

const A_NUMBER_LOOKUP: Record<string, { model: string, year: number | null }> = {
    "A1466": { model: "AIR_13", year: 2017 },
    "A1932": { model: "AIR_13", year: 2018 },
    "A2179": { model: "AIR_13", year: 2020 },
    "A1708": { model: "PRO_13", year: 2016 },
    "A1706": { model: "PRO_13", year: 2017 },
    "A1989": { model: "PRO_13", year: 2018 },
    "A2289": { model: "PRO_13", year: 2020 },
    "A1707": { model: "PRO_15", year: 2016 },
    "A1990": { model: "PRO_15", year: 2018 },
    "A2141": { model: "PRO_16", year: 2019 },
    "A2337": { model: "AIR_13_M1", year: 2020 },
    "A2681": { model: "AIR_13_M2", year: 2022 },
    "A2338": { model: "PRO_13_M", year: null },
    "A2442": { model: "PRO_14_M", year: 2021 },
    "A2485": { model: "PRO_16_M", year: 2021 },
};

const THEME_KEY = "synergy_macbook_theme";
const CONFIG_KEY = "synergy_macbook_pricing_config_v2";


type Theme = "light" | "dark";

const getPalette = (theme: Theme) => {
  const isDark = theme === 'dark';
  return {
    bg: isDark ? 'bg-gray-950' : 'bg-gray-50',
    text: isDark ? 'text-white' : 'text-gray-900',
    subText: isDark ? 'text-slate-400' : 'text-gray-600',
    border: isDark ? 'border-slate-800' : 'border-gray-200',
    cardBg: isDark ? 'bg-slate-900/70 border-slate-700/50' : 'bg-white/90 border-gray-200',
    cardTitle: isDark ? 'text-white' : 'text-gray-900',
    inputBg: isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300',
    inputText: isDark ? 'text-white' : 'text-gray-900',
    accentPrimary: 'text-indigo-500',
    accentBg: 'bg-indigo-600 hover:bg-indigo-700',
    accentText: 'text-white',
    selectedBg: 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500',
    unselectedBg: isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300',
    tabSelected: 'border-b-2 border-indigo-500 text-indigo-500',
    tabUnselected: isDark ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-900',
  };
};

const isMSeriesModel = (modelKey: string | null) => {
    return modelKey && (
        modelKey.includes('_M') || 
        modelKey === 'AIR_13_M1' || 
        modelKey === 'AIR_13_M2'
    );
}

const parseNumberInput = (value: string, fallback: number = 0): number => {
    const num = Number(value);
    if (value === '') return fallback;
    return isNaN(num) ? fallback : num;
}

const ConfigInput = React.memo(({ label, value, onChange, type = "number", min = 0, placeholder = "0", palette }: {
    label: string;
    value: number | string;
    onChange: (value: number | string) => void;
    type?: "number" | "text";
    min?: number;
    placeholder?: string;
    palette: ReturnType<typeof getPalette>;
}) => (
  <div>
      <label className={`block text-sm font-medium mb-1 ${palette.subText}`}>{label}</label>
      <input
          type={type}
          value={value === 0 ? '0' : value}
          onChange={(e) => onChange(type === "number" ? parseNumberInput(e.target.value, 0) : e.target.value)}
          className={`w-full px-3 py-2 rounded-lg text-sm ${palette.inputBg} ${palette.inputText} border ${palette.border} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
          min={min}
          placeholder={placeholder}
      />
  </div>
));

const ANumberLookupInput = React.memo(({ aNumberInput, setANumberInput, palette }: {
    aNumberInput: string;
    setANumberInput: (value: string) => void;
    palette: ReturnType<typeof getPalette>;
}) => (
    <div className="pt-2 border-t mt-3">
        <p className={`text-xs ${palette.subText} mb-1 flex items-center gap-1`}>
            <Search className="h-3 w-3 text-indigo-500" /> A-Number Lookup (Finds model/year automatically)
        </p>
        <input
            type="text"
            placeholder="A-number (e.g., A1708, A2338)"
            value={aNumberInput}
            onChange={(e) => setANumberInput(e.target.value)}
            className={`w-full px-3 py-1.5 rounded-lg text-sm ${palette.inputBg} ${palette.inputText} border ${palette.border} focus:outline-none focus:ring-1 focus:ring-indigo-500`}
        />
    </div>
));

type ConfigEditorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  pricingConfig: PricingConfig;
  setPricingConfig: React.Dispatch<React.SetStateAction<PricingConfig>>;
  palette: ReturnType<typeof getPalette>;
};

const ConfigEditorModalExternal: React.FC<ConfigEditorModalProps> = React.memo(function ConfigEditorModalExternal({
  isOpen, onClose, pricingConfig, setPricingConfig, palette
}) {
  const [tempConfig, setTempConfig] = useState(pricingConfig);
  const [activeTab, setActiveTab] = useState<'modifiers' | 'base' | 'cpu'>('modifiers');
  const [configError, setConfigError] = useState<string | null>(null);
  const [editorModel, setEditorModel] = useState<string>(MODEL_TILES[0].key);
  const [editorYear, setEditorYear] = useState<number | null>(MODEL_TILES[0].years[0] || null);

  useEffect(() => { setTempConfig(pricingConfig); }, [pricingConfig]);

  const getHandleChange = useCallback((field: keyof BaseConfig) => (value: string | number) => {
      if (!editorModel || !editorYear) return;
      setTempConfig(prev => {
          const newConfig = JSON.parse(JSON.stringify(prev)) as PricingConfig;
          if (!newConfig.PRICING_DATA_MAP[editorModel]) {
              newConfig.PRICING_DATA_MAP[editorModel] = {};
          }
          if (!newConfig.PRICING_DATA_MAP[editorModel][editorYear]) {
              newConfig.PRICING_DATA_MAP[editorModel][editorYear] = { 
                  basePrice: 0, 
                  baseStorage: 0, 
                  baseRAM: 0, 
                  baseCPU: 'i5', 
                  cpuUpgrades: {} 
              };
          }
          (newConfig.PRICING_DATA_MAP as any)[editorModel][editorYear][field] = value;
          return newConfig;
      });
  }, [editorModel, editorYear]);

  const handleSave = async () => {
    const checkValidNumber = (v: any) => typeof v === 'number' && !isNaN(v);
    if (
      !checkValidNumber(tempConfig.INTEL_MODIFIERS.RAM_MOD_PER_8GB) ||
      !checkValidNumber(tempConfig.M_SERIES_MODIFIERS.STORAGE_MOD_PER_256GB) ||
      Object.values(tempConfig.CONDITION_DEDUCTS).some(v => !checkValidNumber(v))
    ) {
      setConfigError("Please ensure all global modifier and deduction fields are valid numbers.");
      return;
    }
    setPricingConfig(tempConfig);
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(tempConfig));
      await saveServerConfig(tempConfig);
      setConfigError(null);
      onClose();
    } catch (e) {
      setConfigError("Saved locally, but failed to save to server.");
    }
  };
  
  const handleReset = () => {
      setTempConfig(DEFAULT_PRICING_CONFIG);
      localStorage.removeItem(CONFIG_KEY);
  };

  const currentEditorConfig = useMemo(() => {
      if (!editorModel || !editorYear) return null;
      const modelData = (tempConfig.PRICING_DATA_MAP as any)[editorModel];
      return modelData ? modelData[editorYear] : null;
  }, [editorModel, editorYear, tempConfig.PRICING_DATA_MAP]);

  if (!isOpen) return null;

  const GlobalModifiersEditor = () => (
    <div className="space-y-6 p-2">
        <h3 className={`text-lg font-semibold border-b pb-2 mb-4 ${palette.accentPrimary}`}>1. RAM/SSD Price Bumps</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-4 rounded-lg border ${palette.unselectedBg} space-y-3`}>
                <h4 className="font-bold text-indigo-400">Intel Models (e.g., 2018 Pro 15)</h4>
                <ConfigInput 
                    label="SSD Mod / 256GB (e.g., 50)"
                    value={tempConfig.INTEL_MODIFIERS.STORAGE_MOD_PER_256GB}
                    onChange={(v) => setTempConfig(prev => ({ 
                        ...prev, 
                        INTEL_MODIFIERS: { ...prev.INTEL_MODIFIERS, STORAGE_MOD_PER_256GB: v as number } 
                    }))}
                    min={0}
                    palette={palette}
                />
                <ConfigInput 
                    label="RAM Mod / 8GB (e.g., 75)"
                    value={tempConfig.INTEL_MODIFIERS.RAM_MOD_PER_8GB}
                    onChange={(v) => setTempConfig(prev => ({ 
                        ...prev, 
                        INTEL_MODIFIERS: { ...prev.INTEL_MODIFIERS, RAM_MOD_PER_8GB: v as number } 
                    }))}
                    min={0}
                    palette={palette}
                />
            </div>
            <div className={`p-4 rounded-lg border ${palette.unselectedBg} space-y-3`}>
                <h4 className="font-bold text-indigo-400">M-Series Models (e.g., M1 Air)</h4>
                <ConfigInput 
                    label="SSD Mod / 256GB (e.g., 75)"
                    value={tempConfig.M_SERIES_MODIFIERS.STORAGE_MOD_PER_256GB}
                    onChange={(v) => setTempConfig(prev => ({ 
                        ...prev, 
                        M_SERIES_MODIFIERS: { ...prev.M_SERIES_MODIFIERS, STORAGE_MOD_PER_256GB: v as number } 
                    }))}
                    min={0}
                    palette={palette}
                />
                <ConfigInput 
                    label="RAM Mod / 8GB (e.g., 100)"
                    value={tempConfig.M_SERIES_MODIFIERS.RAM_MOD_PER_8GB}
                    onChange={(v) => setTempConfig(prev => ({ 
                        ...prev, 
                        M_SERIES_MODIFIERS: { ...prev.M_SERIES_MODIFIERS, RAM_MOD_PER_8GB: v as number } 
                    }))}
                    min={0}
                    palette={palette}
                />
            </div>
        </div>
        <h3 className={`text-lg font-semibold border-b pb-2 pt-4 mb-4 ${palette.accentPrimary}`}>2. Condition Deductions</h3>
        <p className={`text-sm ${palette.subText} mb-3`}>Enter deductions as negative numbers (e.g., -50). Grade A is always $0.</p>
        <div className="grid grid-cols-3 gap-4">
            {Object.keys(DEFAULT_PRICING_CONFIG.CONDITION_DEDUCTS).filter(k => k !== 'A').map((key) => (
                <ConfigInput
                    key={key}
                    label={`Grade ${key} Deduct`}
                    value={tempConfig.CONDITION_DEDUCTS[key]}
                    onChange={(v) => setTempConfig(prev => ({ 
                        ...prev, 
                        CONDITION_DEDUCTS: { ...prev.CONDITION_DEDUCTS, [key]: v as number } 
                    }))}
                    min={-10000}
                    palette={palette}
                />
            ))}
        </div>
    </div>
  );

  const BasePricingEditorContent = (
    <div className="space-y-4 p-2">
        <h3 className={`text-lg font-semibold border-b pb-2 mb-4 ${palette.accentPrimary}`}>1. Select Base Model</h3>
        <div className="flex flex-wrap gap-2">
            {MODEL_TILES.map(model => (
                <motion.button
                    key={model.key}
                    onClick={() => { setEditorModel(model.key); setEditorYear(model.years[0] || null); }}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${editorModel === model.key ? palette.tabSelected : palette.unselectedBg + ' ' + palette.subText + ' hover:text-white'}`}
                    whileTap={{ scale: 0.95 }}
                >
                    {model.title}
                </motion.button>
            ))}
        </div>
        <h3 className={`text-lg font-semibold border-b pb-2 pt-4 mb-4 ${palette.accentPrimary}`}>2. Select Year</h3>
        <div className="flex flex-wrap gap-2">
            {MODEL_TILES.find(m => m.key === editorModel)?.years.map(year => (
                <motion.button
                    key={year}
                    onClick={() => setEditorYear(year)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${editorYear === year ? palette.tabSelected : palette.unselectedBg + ' ' + palette.subText + ' hover:text-white'}`}
                    whileTap={{ scale: 0.95 }}
                >
                    {year}
                </motion.button>
            ))}
        </div>
        {currentEditorConfig && (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`p-4 rounded-lg border mt-4 ${palette.unselectedBg} space-y-4`}
            >
                <h3 className={`text-lg font-semibold ${palette.accentPrimary}`}>
                    Editing: {MODEL_TILES.find(m => m.key === editorModel)?.title} {editorYear}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ConfigInput 
                        label="Base Price ($)"
                        value={currentEditorConfig.basePrice}
                        onChange={getHandleChange('basePrice')}
                        palette={palette}
                    />
                    <ConfigInput 
                        label="Base RAM (GB)"
                        value={currentEditorConfig.baseRAM}
                        onChange={getHandleChange('baseRAM')}
                        min={1}
                        palette={palette}
                    />
                    <ConfigInput 
                        label="Base SSD (GB)"
                        value={currentEditorConfig.baseStorage}
                        onChange={getHandleChange('baseStorage')}
                        min={1}
                        palette={palette}
                    />
                    <ConfigInput 
                        label="Base CPU Name"
                        value={currentEditorConfig.baseCPU}
                        onChange={getHandleChange('baseCPU')}
                        type="text"
                        placeholder="e.g., i5, M1"
                        palette={palette}
                    />
                </div>
            </motion.div>
        )}
        {!currentEditorConfig && editorModel && editorYear && (
            <div className={`p-4 rounded-lg border mt-4 text-center ${palette.unselectedBg} text-red-400`}>
                Configuration not found for this Model/Year. Please select another.
            </div>
        )}
    </div>
  );

  const CPUUpgradeEditorContent = () => {
      const handleAddUpgrade = () => {
          if (!editorModel || !editorYear) return;
          const newCpuName = prompt("Enter the name of the new CPU upgrade (e.g., 'i9', 'M1 Max'):");
          if (newCpuName && newCpuName.trim()) {
              const newPrice = parseNumberInput(prompt("Enter the price bump (e.g., 150):") || '0');
              if (!isNaN(newPrice)) {
                  setTempConfig(prev => {
                      const newConfig = JSON.parse(JSON.stringify(prev)) as PricingConfig;
                      (newConfig.PRICING_DATA_MAP as any)[editorModel][editorYear].cpuUpgrades[newCpuName.trim()] = newPrice;
                      return newConfig;
                  });
              }
          }
      };

      const handleDeleteUpgrade = (cpuName: string) => {
          if (!editorModel || !editorYear) return;
          setTempConfig(prev => {
              const newConfig = JSON.parse(JSON.stringify(prev)) as PricingConfig;
              delete (newConfig.PRICING_DATA_MAP as any)[editorModel][editorYear].cpuUpgrades[cpuName];
              return newConfig;
          });
      };

      return (
          <div className="space-y-4 p-2">
              <p className={`text-sm ${palette.subText}`}>
                  Select a Model and Year in the <b>Base Price Editor</b> tab to edit its CPU upgrades.
              </p>
              {currentEditorConfig ? (
                  <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`p-4 rounded-lg border mt-4 ${palette.unselectedBg} space-y-3`}
                  >
                      <h3 className={`text-lg font-semibold ${palette.accentPrimary}`}>
                          Upgrades for: {MODEL_TILES.find(m => m.key === editorModel)?.title} {editorYear}
                      </h3>
                      <p className={`text-sm ${palette.subText}`}>Base CPU: <span className="font-mono text-indigo-400">{currentEditorConfig.baseCPU}</span> (Price: $0)</p>
                      <ul className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                          {Object.entries(currentEditorConfig.cpuUpgrades).map(([cpu, price]) => (
                              <li key={cpu} className="flex justify-between items-center p-2 rounded-lg bg-slate-700/50">
                                  <span className="font-medium">{cpu}</span>
                                  <div className="flex items-center gap-2">
                                      <ConfigInput
                                          label=""
                                          value={price}
                                          onChange={(v) => setTempConfig(prev => {
                                              const newConfig = JSON.parse(JSON.stringify(prev)) as PricingConfig;
                                              (newConfig.PRICING_DATA_MAP as any)[editorModel][editorYear].cpuUpgrades[cpu] = v as number;
                                              return newConfig;
                                          })}
                                          min={0}
                                          placeholder="Price"
                                          palette={palette}
                                      />
                                      <motion.button
                                          onClick={() => handleDeleteUpgrade(cpu)}
                                          className="p-1 rounded-full text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                                          whileTap={{ scale: 0.9 }}
                                      >
                                          <Trash2 className="w-4 h-4"/>
                                      </motion.button>
                                  </div>
                              </li>
                          ))}
                      </ul>
                      <motion.button
                          onClick={handleAddUpgrade}
                          className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${palette.accentBg} ${palette.accentText} mt-4`}
                          whileTap={{ scale: 0.98 }}
                      >
                          <Plus className="h-4 w-4" /> Add New CPU Upgrade
                      </motion.button>
                  </motion.div>
              ) : (
                  <div className={`p-4 rounded-lg border mt-4 text-center ${palette.unselectedBg} text-yellow-400`}>
                      Please select a Model and Year in the <b>Base Price Editor</b> tab first.
                  </div>
              )}
          </div>
      );
  };

  return (
      <motion.div 
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div 
          className={`w-full max-w-5xl max-h-[90vh] ${palette.cardBg} rounded-xl shadow-2xl p-6 flex flex-col`}
          initial={{ scale: 0.9, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 50 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <div className="flex justify-between items-center mb-4 border-b pb-3 border-indigo-500/30">
            <h2 className={`text-2xl font-bold flex items-center gap-2 ${palette.accentPrimary}`}>
              <Settings className="w-6 h-6"/> Pricing Configuration Editor
            </h2>
            <motion.button
              onClick={onClose}
              className={`p-1 rounded-full ${palette.unselectedBg} text-gray-400 hover:text-white hover:bg-red-500`}
              whileHover={{ rotate: 90 }}
            >
              <XCircle className="w-6 h-6"/>
            </motion.button>
          </div>
          <div className={`flex border-b mb-4 ${palette.border}`}>
              <button
                  onClick={() => setActiveTab('modifiers')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'modifiers' ? palette.tabSelected : palette.tabUnselected}`}
              >
                  Global Modifiers & Deducts
              </button>
              <button
                  onClick={() => setActiveTab('base')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'base' ? palette.tabSelected : palette.tabUnselected}`}
              >
                  Base Price Editor (Model/Year)
              </button>
              <button
                  onClick={() => setActiveTab('cpu')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'cpu' ? palette.tabSelected : palette.tabUnselected}`}
              >
                  CPU Upgrade Editor
              </button>
          </div>
          {configError && (
            <div className="p-3 mb-4 bg-red-900/50 border border-red-500 rounded-lg text-sm text-red-300 flex items-center gap-2">
              <XCircle className="w-5 h-5"/> Error: {configError}
            </div>
          )}
          <div className="flex-grow overflow-y-auto custom-scrollbar p-2">
            {activeTab === 'modifiers' && GlobalModifiersEditor()}     
            {activeTab === 'base' && BasePricingEditorContent}         
            {activeTab === 'cpu' && CPUUpgradeEditorContent()}     
          </div>
          <div className="mt-4 flex justify-between gap-3 border-t pt-4">
            <motion.button
              onClick={handleReset}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-600 hover:bg-gray-700 text-white`}
              whileTap={{ scale: 0.98 }}
            >
              <Wrench className="w-4 h-4"/> Reset to Default
            </motion.button>
            <motion.button
              onClick={handleSave}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${palette.accentBg} ${palette.accentText} shadow-lg`}
              whileTap={{ scale: 0.98 }}
            >
              <Save className="w-4 h-4"/> Save and Apply Changes
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
  );
});

export default function MacbookPricer() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
        const saved = localStorage.getItem(THEME_KEY) as Theme | null;
        if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return "dark";
  });
  
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    try {
        localStorage.setItem(THEME_KEY, newTheme);
    } catch {}
  };
  
  const palette = getPalette(theme);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(() => {
    try {
        const savedConfig = localStorage.getItem(CONFIG_KEY);
        if (savedConfig) {
            const parsed = JSON.parse(savedConfig);
            if (parsed.PRICING_DATA_MAP && parsed.INTEL_MODIFIERS) {
                return parsed;
            }
        }
    } catch (e) {
        console.error("Failed to load config from storage, using default:", e);
    }
    return DEFAULT_PRICING_CONFIG;
  });

  useEffect(() => {
    (async () => {
      try {
        const serverCfg = await fetchServerConfig();
        if (serverCfg && serverCfg.PRICING_DATA_MAP) {
          setPricingConfig(serverCfg);
          try { localStorage.setItem(CONFIG_KEY, JSON.stringify(serverCfg)); } catch {}
        }
      } catch (e) {
        console.warn("GET /pricing-config failed; using local/default", e);
      }
    })();
  }, []);

  const { 
    INTEL_MODIFIERS, 
    M_SERIES_MODIFIERS, 
    CONDITION_DEDUCTS, 
    PRICING_DATA_MAP 
  } = pricingConfig;

  const [selectedModelKey, setSelectedModelKey] = useState<keyof typeof PRICING_DATA_MAP | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedRAM, setSelectedRAM] = useState<number | null>(null); 
  const [selectedStorage, setSelectedStorage] = useState<number | null>(null); 
  const [selectedProcessor, setSelectedProcessor] = useState<string | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [selectedSizeInches, setSelectedSizeInches] = useState<number | null>(null); // NEW
  const [aNumberInput, setANumberInput] = useState('');
  const [msrpField, setMsrpField] = useState<string>('');
  const [ourPriceField, setOurPriceField] = useState<string>('');
  const msrpNum = useMemo(() => parseNumberInput(msrpField, 0), [msrpField]);
  const ourPriceNum = useMemo(() => parseNumberInput(ourPriceField, 0), [ourPriceField]);
  const msrp70 = useMemo(() => (msrpNum > 0 ? Math.round(msrpNum * 0.70) : 0), [msrpNum]);

  useEffect(() => {
    if (selectedModelKey && selectedYear) {
      if (!msrpField || msrpField.trim() === "" || msrpField === "0") {
        setMsrpField("999");
      }
    }
  }, [selectedModelKey, selectedYear]);

  useEffect(() => {
    (async () => {
      if (!selectedModelKey || !selectedYear) return;
      if (msrpField && msrpField !== "999") return;
      const val = await fetchMsrp(String(selectedModelKey), selectedYear);
      setMsrpField(String(Math.round(val)));
    })();
  }, [selectedModelKey, selectedYear, msrpField]);

  const selectedModelData = useMemo(() => {
    return MODEL_TILES.find(m => m.key === selectedModelKey);
  }, [selectedModelKey]);

  const baseConfiguration = useMemo((): BaseConfig | null => {
    if (!selectedModelKey || !selectedYear) {
      return null;
    }
    return (PRICING_DATA_MAP as any)[selectedModelKey]?.[selectedYear] || null;
  }, [selectedModelKey, selectedYear, PRICING_DATA_MAP]);

  useEffect(() => {
    if (selectedModelKey && selectedYear && baseConfiguration) {
        setSelectedRAM(baseConfiguration.baseRAM);
        setSelectedStorage(baseConfiguration.baseStorage);
        setSelectedProcessor(baseConfiguration.baseCPU);
        setSelectedCondition('A');
        setSelectedSizeInches(null); // ensure cleared for non-specials
    }
    // For fixed-price buckets, seed sensible defaults for labeling
    if (selectedModelKey && isSpecialKey(selectedModelKey)) {
        setSelectedRAM(prev => prev ?? 4);
        setSelectedStorage(prev => prev ?? 256);
        setSelectedProcessor(prev => prev ?? 'i5');
        setSelectedCondition('A');
        setSelectedSizeInches(prev => prev ?? SPECIAL_SIZE_OPTIONS[selectedModelKey!][0]); // NEW
    }
  }, [selectedModelKey, selectedYear, baseConfiguration]);

  // --- Core Pricing Calculation with Special Case Handling ---
  const finalPrice = useMemo(() => {
    let price = 0;
    
    // Handle special fixed-price models (Air MagSafe 1, Air 2012–2016, Pro 2012–2015)
    if (isSpecialKey(selectedModelKey)) {
      const fixedPrice = SPECIAL_FIXED_PRICE[selectedModelKey!];
      const details: Record<string, number> = { "Fixed Price": fixedPrice };
      // reflect chosen specs (no price impact)
      if (selectedSizeInches) details[`Screen Size (${selectedSizeInches}")`] = 0; // NEW
      if (selectedProcessor) details[`CPU (${selectedProcessor})`] = 0;
      if (selectedRAM != null) details[`RAM (${selectedRAM}GB)`] = 0;
      if (selectedStorage != null) {
        const label = selectedStorage >= 1024 ? `${selectedStorage/1024}TB` : `${selectedStorage}GB`;
        details[`Storage (${label})`] = 0;
      }
      return {
        final: Math.max(0, Math.round(fixedPrice)),
        details,
        mods: { STORAGE_MOD_PER_256GB: 0, RAM_MOD_PER_8GB: 0 } // No mods for fixed-price models
      };
    }

    if (!baseConfiguration) {
      return { final: 0, details: {} as Record<string, number>, mods: INTEL_MODIFIERS };
    }
    
    const { basePrice, baseStorage, baseRAM, baseCPU, cpuUpgrades } = baseConfiguration;
    const { STORAGE_MOD_PER_256GB, RAM_MOD_PER_8GB } = isMSeriesModel(selectedModelKey) 
        ? M_SERIES_MODIFIERS 
        : INTEL_MODIFIERS;
    
    price = basePrice;
    let details: Record<string, number> = {};
    details["Base Value (Model/Year)"] = basePrice;

    const currentStorage = selectedStorage !== null ? selectedStorage : baseStorage;
    const currentRAM = selectedRAM !== null ? selectedRAM : baseRAM;
    const currentCPU = selectedProcessor !== null ? selectedProcessor : baseCPU;

    let processorMod = 0;
    if (currentCPU !== baseCPU) {
      processorMod = cpuUpgrades[currentCPU] || 0; 
      price += processorMod;
    }
    details[`CPU Upgrade (${currentCPU})`] = processorMod;

    let ramMod = 0;
    if (currentRAM > baseRAM) {
      const ramDiffGB = currentRAM - baseRAM;
      const increments = Math.floor(ramDiffGB / 8); 
      ramMod = increments * RAM_MOD_PER_8GB;
      price += ramMod;
    }
    details[`RAM Bump (+${currentRAM}GB)`] = ramMod;

    let storageMod = 0;
    if (currentStorage > baseStorage) {
      const storageDiffGB = currentStorage - baseStorage;
      const increments = Math.floor(storageDiffGB / 256); 
      storageMod = increments * STORAGE_MOD_PER_256GB;
      price += storageMod;
    }
    details[`Storage Bump (+${currentStorage}GB)`] = storageMod;

    const conditionMod = CONDITION_DEDUCTS[selectedCondition] || 0;
    price += conditionMod;
    details[`Condition (${selectedCondition} Deduct)`] = conditionMod;

    return { 
      final: Math.max(0, Math.round(price)),
      details: details,
      mods: { STORAGE_MOD_PER_256GB, RAM_MOD_PER_8GB }
    };
  }, [baseConfiguration, selectedStorage, selectedRAM, selectedProcessor, selectedCondition, selectedModelKey, selectedSizeInches, INTEL_MODIFIERS, M_SERIES_MODIFIERS, CONDITION_DEDUCTS]);

  useEffect(() => {
      const timer = setTimeout(() => {
          const formattedInput = aNumberInput.trim().toUpperCase();
          const lookupResult = A_NUMBER_LOOKUP[formattedInput];
          if (lookupResult) {
              setSelectedModelKey(lookupResult.model as keyof typeof PRICING_DATA_MAP);
              if (lookupResult.year !== null) {
                  setSelectedYear(lookupResult.year);
              } else {
                  setSelectedYear(null);
              }
          }
      }, 300);
      return () => clearTimeout(timer);
  }, [aNumberInput]);

  const handleCopy = () => {
    if (finalPrice.final === 0 || (!baseConfiguration && !isSpecialKey(selectedModelKey))) return;
    
    const currentBaseConfig = baseConfiguration;
    const currentRAM = selectedRAM || (currentBaseConfig?.baseRAM ?? 'N/A');
    const currentStorage = selectedStorage || (currentBaseConfig?.baseStorage ?? 'N/A');
    const currentCPU = selectedProcessor || (currentBaseConfig?.baseCPU ?? 'N/A');
    const sizeLine = isSpecialKey(selectedModelKey) && selectedSizeInches ? `Screen Size: ${selectedSizeInches}"\n` : '';

    const textToCopy = 
        `Model: ${selectedModelData?.title || 'Unknown'} ${selectedYear || 'Unknown'}\n` +
        sizeLine +
        `Processor: ${currentCPU}\n` +
        `RAM: ${currentRAM}GB\n` +
        `Storage: ${currentStorage}GB\n` +
        `Condition: ${selectedCondition}\n` +
        `A-Number (if known): ${aNumberInput || 'N/A'}\n` +
        `------------------------\n` +
        `Estimated Price: $${finalPrice.final}`;
    
    const textarea = document.createElement('textarea');
    textarea.value = textToCopy;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Could not copy text: ', err);
    }
    document.body.removeChild(textarea);
  };

  async function handlePrintClick({
    modelFamily,
    sizeInch,
    year,
    chip,
    ramGb,
    storageGb,
    msrp,
    ourPrice,
  }: {
    modelFamily: "Air" | "Pro";
    sizeInch: number;
    year: number;
    chip: string;
    ramGb: number;
    storageGb: number;
    msrp: number;
    ourPrice?: number;
  }) {
    const payload = {
      spec: {
        model_family: modelFamily,
        size_inch: sizeInch,
        year,
        chip,
        ram_gb: ramGb,
        storage_gb: storageGb,
      },
      msrp,
      our_price: ourPrice ?? Math.round(msrp * 0.7),
    };

    const res = await fetch("/api/labels/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const maybeJson = raw ? JSON.parse(raw) : null;
        msg = (maybeJson?.detail || maybeJson?.error || raw || msg).toString();
      } catch {
        msg = raw || msg;
      }
      throw new Error(`Preview failed: ${msg}`);
    }

    let data: LabelPreviewResponse | null = null;
    try {
      data = raw ? (JSON.parse(raw) as LabelPreviewResponse) : null;
    } catch {
      data = null;
    }

    const out: LabelPreviewResponse =
      data && data.productName && data.unitPrice && data.ourPrice && data.date
        ? data
        : {
            productName: "Apple MacBook",
            unitPrice: String(Math.round(msrp)),
            ourPrice: String(Math.round(payload.our_price as number)),
            date: new Date().toLocaleDateString("en-US", {
              month: "2-digit",
              day: "2-digit",
              year: "2-digit",
            }),
          };

    openPrintWindow(out);
  }

  const getSpecBasics = (key: string | null): { modelFamily: "Air" | "Pro"; sizeInch: number } | null => {
    if (!key) return null;
    switch (key) {
      case "AIR_13": 
      case "AIR_13_M1": return { modelFamily: "Air", sizeInch: 13 };
      case "AIR_13_M2": return { modelFamily: "Air", sizeInch: 13.6 };
      case "PRO_13":
      case "PRO_13_M": return { modelFamily: "Pro", sizeInch: 13 };
      case "PRO_14_M": return { modelFamily: "Pro", sizeInch: 14 };
      case "PRO_15":   return { modelFamily: "Pro", sizeInch: 15 };
      case "PRO_16":
      case "PRO_16_M": return { modelFamily: "Pro", sizeInch: 16 };
      // Special cases: Assign reasonable defaults for printing
      case SPECIAL_KEYS.AIR_MAGS1:
      case SPECIAL_KEYS.AIR_2012_2016:
        return { modelFamily: "Air", sizeInch: 13 };
      case SPECIAL_KEYS.PRO_2012_2015:
        return { modelFamily: "Pro", sizeInch: 15 };
      default: return null;
    }
  };

  const onPrint = () => {
    if (!selectedModelKey || !selectedYear) return;

    const basics = getSpecBasics(selectedModelKey as string);
    if (!basics) return;

    // Use chosen size for special buckets
    const sizeInch = isSpecialKey(selectedModelKey) && selectedSizeInches ? selectedSizeInches : basics.sizeInch;

    const ramGb = (selectedRAM ?? baseConfiguration?.baseRAM ?? 8);
    const storageGb = (selectedStorage ?? baseConfiguration?.baseStorage ?? 256);
    const chip = (selectedProcessor ?? baseConfiguration?.baseCPU ?? 'Unknown');

    const our = (ourPriceNum > 0 ? ourPriceNum : finalPrice.final);
    const msrp = msrpNum;

    const inch = `"`;
    const sep = " | ";
    const productName =
      `MacBook ${basics.modelFamily} ${Math.round(sizeInch)}${inch} ` +
      `(${selectedYear}) ${chip}${sep}${ramGb}GB${sep}${storageGb}GB`;

    const pad2 = (n: number) => String(n).padStart(2, "0");
    const now = new Date();
    const date = `${pad2(now.getMonth() + 1)}/${pad2(now.getDate())}/${String(now.getFullYear()).slice(-2)}`;

    openPrintWindow({
      productName,
      unitPrice: String(Math.round(msrp)),
      ourPrice: String(Math.round(our)),
      date,
    });
  };

  const isConfigReady = selectedModelKey && selectedYear && (baseConfiguration || isSpecialKey(selectedModelKey));

  const ModelTile = ({ model }: { model: typeof MODEL_TILES[number] }) => {
    const isSelected = selectedModelKey === model.key;
    return (
      <motion.button
        key={model.key}
        onClick={() => {
            setSelectedModelKey(model.key as keyof typeof PRICING_DATA_MAP);
            setSelectedYear(null); 
        }}
        className={`w-full p-2.5 rounded-lg text-left transition-all duration-300 transform shadow-sm
                    ${isSelected ? palette.selectedBg : palette.unselectedBg}
                    ${palette.border} border
                    hover:shadow-lg hover:scale-[1.01]`}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center justify-between">
            <h3 className={`text-base font-bold ${palette.cardTitle}`}>{model.title}</h3>
            {isSelected && <CheckCircle className={`h-4 w-4 ${palette.accentPrimary}`} />}
        </div>
        <p className={`text-xs mt-0.5 ${palette.subText}`}>{model.range}</p>
      </motion.button>
    );
  };

  const YearChip = ({ year }: { year: number }) => {
    const isSelected = selectedYear === year;
    return (
      <motion.button
        key={year}
        onClick={() => setSelectedYear(year)}
        className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-200
                    ${isSelected 
                        ? `${palette.accentBg} ${palette.accentText}` 
                        : `${palette.unselectedBg} ${palette.cardTitle} border ${palette.border} hover:bg-slate-700/50`}`}
        whileTap={{ scale: 0.9 }}
      >
        {year}
      </motion.button>
    );
  };

  const OptionButton = ({ label, value, current, modifier, onClick, isCondition = false }: {
      label: string;
      value: string | number;
      current: string | number;
      modifier: number;
      onClick: () => void;
      isCondition?: boolean;
  }) => {
      const isSelected = value === current;
      const isBase = (label.includes('(Base)'));
      const isNegative = modifier < 0;

      const displayMod = modifier === 0 
          ? '' 
          : (isNegative ? `(-$${Math.abs(modifier)})` : `(+$${modifier})`);
      
      const modColor = isBase || modifier === 0 
          ? palette.subText 
          : (isNegative ? 'text-red-400' : 'text-emerald-400');
          
      return (
          <motion.button
              onClick={onClick}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 shadow-sm
                          ${isSelected 
                              ? `${palette.accentBg} ${palette.accentText} border-indigo-700` 
                              : `${palette.unselectedBg} ${palette.cardTitle} border-gray-500/50 hover:bg-slate-700/50`}`}
              whileTap={{ scale: 0.95 }}
          >
              <div className="font-bold whitespace-nowrap">{label}</div>
              <div className={`mt-0.5 ${modColor} ${isSelected ? 'text-indigo-200' : ''} ${isCondition ? 'text-[10px]' : ''}`}>{displayMod}</div>
          </motion.button>
      );
  };

  const customScrollbarStyle = `
    .custom-scrollbar::-webkit-scrollbar {
        width: 8px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background-color: ${theme === 'dark' ? '#4f46e5' : '#6366f1'};
        border-radius: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: ${theme === 'dark' ? '#1f2937' : '#f3f4f6'};
        border-radius: 4px;
    }
  `;

  return (
    <div className={`min-h-screen ${palette.bg} ${palette.text} py-6 px-4 sm:px-6 lg:px-8 transition-colors duration-500`}>
        <script dangerouslySetInnerHTML={{ __html: `
            function parseNumberInput(value) {
                const num = Number(value);
                return isNaN(num) ? 0 : num;
            }
        `}} />
        <style dangerouslySetInnerHTML={{ __html: customScrollbarStyle }} />

        <ConfigEditorModalExternal
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          pricingConfig={pricingConfig}
          setPricingConfig={setPricingConfig}
          palette={palette}
        />

      <div className="max-w-6xl mx-auto relative">
        <header
          className={`sticky top-0 z-20 transition-colors duration-300 pt-4 pb-0`}
        >
          <div
            className={`max-w-6xl mx-auto rounded-xl overflow-hidden border-b-0 border ${
              theme === "dark"
                ? "bg-gray-900/80 border-gray-800"
                : "bg-white/80 border-gray-200"
            } backdrop-blur-md px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between shadow-xl`}
          >
            <div className="flex items-center space-x-4">
              <div className="flex flex-col leading-tight">
                <h2
  className={`${
    theme === "dark" ? "text-indigo-400" : "text-indigo-600"
  } text-xl font-black tracking-tight`}
>
  Synergy
</h2>
                <h1
                  className={`${
                    theme === "dark" ? "text-gray-300" : "text-gray-700"
                  } text-sm font-semibold tracking-tight mt-0.5`}
                >
                  MacBook Pricer Utility
                </h1>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <a
                href="/utilities"
                className={`inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200 ${
                  theme === "dark"
                    ? "border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-100"
                }`}
                title="Back to Utilities"
                aria-label="Back to Utilities"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Utilities</span>
                <span className="sm:hidden">Back</span>
              </a>
              <div
                className={`${
                  theme === "dark" ? "bg-gray-700/50" : "bg-gray-300"
                } h-6 w-px`}
                aria-hidden
              />
              <motion.button
                onClick={() => setIsConfigOpen(true)}
                className={`inline-flex items-center justify-center p-2 rounded-lg transition-colors duration-200 ${
                  theme === "dark"
                    ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                    : "text-gray-700 hover:bg-gray-100"
                } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  theme === "dark"
                    ? "focus:ring-indigo-500 focus:ring-offset-gray-900"
                    : "focus:ring-indigo-500"
                }`}
                whileTap={{ scale: 0.95 }}
                title="Open Configuration"
                aria-label="Open Configuration"
              >
                <Settings className="h-5 w-5" />
              </motion.button>
              <motion.button
                onClick={toggleTheme}
                className={`inline-flex items-center justify-center p-2 rounded-lg transition-colors duration-200 ${
                  theme === "dark"
                    ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                    : "text-gray-700 hover:bg-gray-100"
                } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  theme === "dark"
                    ? "focus:ring-indigo-500 focus:ring-offset-gray-900"
                    : "focus:ring-indigo-500"
                }`}
                whileTap={{ scale: 0.95 }}
                title="Toggle Theme"
                aria-label={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
              >
                {theme === "dark" ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </motion.button>
            </div>
          </div>
        </header>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <motion.div 
                className={`lg:col-span-2 space-y-4`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className={`p-4 rounded-xl border ${palette.border} ${palette.cardBg} space-y-3`}>
                    <h2 className={`text-xl font-semibold ${palette.cardTitle} flex items-center gap-2`}>
                        <Laptop className="w-5 h-5 text-indigo-500"/>
                        1. Select Model & Year
                    </h2>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                        {MODEL_TILES.map(model => (
                            <ModelTile key={model.key} model={model} />
                        ))}
                    </div>
                    <AnimatePresence>
                        {selectedModelData && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                className="overflow-hidden space-y-3 pt-2 border-t mt-3"
                            >
                                <div className="flex flex-wrap gap-2">
                                    {selectedModelData.years.map(year => {
                                        const configExists = !!(PRICING_DATA_MAP as any)[selectedModelKey as string]?.[year] || isSpecialKey(selectedModelKey);
                                        if (!configExists && !isSpecialKey(selectedModelKey)) return null;
                                        return <YearChip key={year} year={year} />;
                                    })}
                                </div>
                                {selectedModelKey === 'PRO_13_M' && aNumberInput.trim().toUpperCase() === 'A2338' && (
                                    <p className="text-xs text-red-400">
                                        *A2338 is ambiguous (2020: M1, 2022: M2). Please select the correct year above.
                                    </p>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <ANumberLookupInput 
                        aNumberInput={aNumberInput} 
                        setANumberInput={setANumberInput} 
                        palette={palette} 
                    />
                </div>
                <AnimatePresence>
                    {isConfigReady && (baseConfiguration || isSpecialKey(selectedModelKey)) && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.4 }}
                        >
                            <h2 className={`text-xl font-semibold ${palette.cardTitle} mb-3 flex items-center gap-2`}>
                                <Wrench className="w-5 h-5 text-indigo-500" />
                                2. Configure Core Specs & Condition
                            </h2>
                            <div className={`space-y-4 p-4 rounded-xl border ${palette.border} ${palette.cardBg} max-h-[60vh] overflow-y-auto custom-scrollbar`}>
                                {isSpecialKey(selectedModelKey) ? (
                                    <>
                                        {/* NEW: Screen Size (label-only, $0) */}
                                        <div>
                                            <h3 className={`text-base font-semibold ${palette.cardTitle} flex items-center gap-1 mb-2`}>
                                                Screen Size
                                                <span className={`text-xs ${palette.subText} ml-2`}>
                                                    All options: $0
                                                </span>
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {SPECIAL_SIZE_OPTIONS[selectedModelKey!].map(inches => (
                                                    <OptionButton 
                                                        key={`size-${inches}`}
                                                        label={`${inches}"`}
                                                        value={inches}
                                                        current={selectedSizeInches ?? SPECIAL_SIZE_OPTIONS[selectedModelKey!][0]}
                                                        modifier={0}
                                                        onClick={() => setSelectedSizeInches(inches)}
                                                    />
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className={`text-base font-semibold ${palette.cardTitle} flex items-center gap-1 mb-2`}>
                                                <CpuIcon className="h-4 w-4 text-indigo-500/80" /> Processor
                                                <span className={`text-xs ${palette.subText} ml-2`}>
                                                    All options: $0
                                                </span>
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {SPECIAL_CPU_OPTIONS[selectedModelKey!].map(cpu => (
                                                    <OptionButton 
                                                        key={`cpu-${cpu}`}
                                                        label={cpu}
                                                        value={cpu}
                                                        current={selectedProcessor || cpu}
                                                        modifier={0}
                                                        onClick={() => setSelectedProcessor(cpu)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t">
                                            <h3 className={`text-base font-semibold ${palette.cardTitle} flex items-center gap-1 mb-2`}>
                                                <MemoryStick className="h-4 w-4 text-indigo-500/80" /> RAM
                                                <span className={`text-xs ${palette.subText} ml-2`}>
                                                    All options: $0
                                                </span>
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {RAM_OPTIONS.map(ramGb => (
                                                    <OptionButton 
                                                        key={`ram-${ramGb}`}
                                                        label={`${ramGb}GB`}
                                                        value={ramGb}
                                                        current={selectedRAM ?? 4}  // use 4GB default for older
                                                        modifier={0}
                                                        onClick={() => setSelectedRAM(ramGb)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t">
                                            <h3 className={`text-base font-semibold ${palette.cardTitle} flex items-center gap-1 mb-2`}>
                                                <Database className="h-4 w-4 text-indigo-500/80" /> Storage
                                                <span className={`text-xs ${palette.subText} ml-2`}>
                                                    All options: $0
                                                </span>
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {STORAGE_OPTIONS.map(storageGb => {
                                                    const label = storageGb >= 1024 ? `${storageGb / 1024}TB` : `${storageGb}GB`;
                                                    return (
                                                        <OptionButton 
                                                            key={`ssd-${storageGb}`}
                                                            label={label}
                                                            value={storageGb}
                                                            current={selectedStorage ?? 256}
                                                            modifier={0}
                                                            onClick={() => setSelectedStorage(storageGb)}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t">
                                            <h3 className={`text-base font-semibold ${palette.cardTitle} flex items-center gap-1 mb-2`}>
                                                <Star className="h-4 w-4 text-indigo-500/80" /> Condition Deduction
                                            </h3>
                                            <div className="flex gap-2">
                                                {Object.entries(CONDITION_DEDUCTS).map(([cond, mod]) => (
                                                    <OptionButton
                                                        key={cond}
                                                        label={`Grade ${cond}`}
                                                        value={cond}
                                                        current={selectedCondition}
                                                        modifier={mod}
                                                        isCondition={true}
                                                        onClick={() => setSelectedCondition(cond as 'A' | 'B' | 'C' | 'D')}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <h3 className={`text-base font-semibold ${palette.cardTitle} flex items-center gap-1 mb-2`}>
                                                <CpuIcon className="h-4 w-4 text-indigo-500/80" /> Processor
                                                <span className={`text-xs ${palette.subText} ml-2`}>
                                                    Base: <span className="font-mono text-indigo-400">{baseConfiguration!.baseCPU}</span>
                                                </span>
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                <OptionButton 
                                                    label={`${baseConfiguration!.baseCPU} (Base)`}
                                                    value={baseConfiguration!.baseCPU}
                                                    current={selectedProcessor || baseConfiguration!.baseCPU}
                                                    modifier={0}
                                                    onClick={() => setSelectedProcessor(baseConfiguration!.baseCPU)}
                                                />
                                                {Object.entries(baseConfiguration!.cpuUpgrades).map(([cpu, mod]) => (
                                                    <OptionButton 
                                                        key={`cpu-${cpu}`}
                                                        label={cpu}
                                                        value={cpu}
                                                        current={selectedProcessor || baseConfiguration!.baseCPU}
                                                        modifier={mod}
                                                        onClick={() => setSelectedProcessor(cpu)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t">
                                            <h3 className={`text-base font-semibold ${palette.cardTitle} flex items-center gap-1 mb-2`}>
                                                <MemoryStick className="h-4 w-4 text-indigo-500/80" /> RAM
                                                <span className={`text-xs ${palette.subText} ml-2`}>
                                                    Base: <span className="font-mono text-indigo-400">{baseConfiguration!.baseRAM}GB</span> (+${finalPrice.mods.RAM_MOD_PER_8GB}/8GB)
                                                </span>
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {RAM_OPTIONS.filter(ramGb => ramGb >= baseConfiguration!.baseRAM).map(ramGb => {
                                                    const base = baseConfiguration!.baseRAM;
                                                    const isBase = ramGb === base;
                                                    const current = selectedRAM || base;
                                                    const modValue = isBase ? 0 : Math.floor(((ramGb - base) / 8)) * finalPrice.mods.RAM_MOD_PER_8GB;
                                                    return (
                                                        <OptionButton 
                                                            key={`ram-${ramGb}`}
                                                            label={`${ramGb}GB ${isBase ? '(Base)' : ''}`}
                                                            value={ramGb}
                                                            current={current}
                                                            modifier={modValue}
                                                            onClick={() => setSelectedRAM(ramGb)}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t">
                                            <h3 className={`text-base font-semibold ${palette.cardTitle} flex items-center gap-1 mb-2`}>
                                                <Database className="h-4 w-4 text-indigo-500/80" /> Storage
                                                <span className={`text-xs ${palette.subText} ml-2`}>
                                                    Base: <span className="font-mono text-indigo-400">{baseConfiguration!.baseStorage}GB</span> (+${finalPrice.mods.STORAGE_MOD_PER_256GB}/256GB)
                                                </span>
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {STORAGE_OPTIONS.filter(storageGb => storageGb >= baseConfiguration!.baseStorage).map(storageGb => {
                                                    const base = baseConfiguration!.baseStorage;
                                                    const isBase = storageGb === base;
                                                    const current = selectedStorage || base;
                                                    const modValue = isBase ? 0 : Math.floor(((storageGb - base) / 256)) * finalPrice.mods.STORAGE_MOD_PER_256GB;
                                                    return (
                                                        <OptionButton 
                                                            key={`ssd-${storageGb}`}
                                                            label={`${storageGb >= 1024 ? `${storageGb / 1024}TB` : `${storageGb}GB`} ${isBase ? '(Base)' : ''}`}
                                                            value={storageGb}
                                                            current={current}
                                                            modifier={modValue}
                                                            onClick={() => setSelectedStorage(storageGb)}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t">
                                            <h3 className={`text-base font-semibold ${palette.cardTitle} flex items-center gap-1 mb-2`}>
                                                <Star className="h-4 w-4 text-indigo-500/80" /> Condition Deduction
                                            </h3>
                                            <div className="flex gap-2">
                                                {Object.entries(CONDITION_DEDUCTS).map(([cond, mod]) => (
                                                    <OptionButton
                                                        key={cond}
                                                        label={`Grade ${cond}`}
                                                        value={cond}
                                                        current={selectedCondition}
                                                        modifier={mod}
                                                        isCondition={true}
                                                        onClick={() => setSelectedCondition(cond as 'A' | 'B' | 'C' | 'D')}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
            <motion.div 
                className={`lg:col-span-1 sticky top-6 h-fit p-5 rounded-xl shadow-2xl backdrop-blur-md transition-colors ${palette.cardBg}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
            >
                <div className="mb-4">
                    <p className={`text-sm font-medium ${palette.subText} flex items-center gap-2`}>
                       <Laptop className="w-4 h-4"/> 
                       {selectedModelData?.title || 'Model Missing'} 
                       <span className={`font-mono text-base font-bold ${palette.accentPrimary}`}>{selectedYear || '----'}</span>
                    </p>
                    <p className={`text-xs mt-1 ${palette.subText} min-h-[24px]`}>
                        {isConfigReady ? 
                            (isSpecialKey(selectedModelKey) 
                                ? `${selectedProcessor || 'i5'} / ${selectedRAM ?? 4}GB / ${selectedStorage ?? 256}GB (Cond: ${selectedCondition})` 
                                : `${selectedProcessor || baseConfiguration!.baseCPU} / ${selectedRAM || baseConfiguration!.baseRAM}GB / ${selectedStorage || baseConfiguration!.baseStorage}GB (Cond: ${selectedCondition})`
                            ) 
                            : 'Select Model & Year to configure.'}
                    </p>
                    <div className="mt-4 text-center py-4 bg-indigo-600/10 rounded-xl border border-indigo-500/50">
                        <p className="text-sm font-medium text-indigo-400">Estimated Resale Price</p>
                        <motion.p 
                            key={finalPrice.final}
                            className="text-6xl font-extrabold mt-1 tracking-tight text-indigo-500"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        >
                            <span className="text-4xl align-top mr-1">$</span>
                            {finalPrice.final === 0 ? '---' : finalPrice.final}
                        </motion.p>
                    </div>
                </div>
                <div className="mb-4 border-t pt-3">
                  <h3 className={`text-sm font-semibold ${palette.cardTitle} mb-2`}>Label Pricing (for Print)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-xs mb-1 ${palette.subText}`}>MSRP ($)</label>
                      <input
                        type="number"
                        value={msrpField}
                        onChange={(e) => setMsrpField(e.target.value)}
                        className={`w-full px-2 py-1.5 rounded-md text-sm ${palette.inputBg} ${palette.inputText} border ${palette.border} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        placeholder="0.00"
                        min={0}
                        step="1"
                      />
                      <div className={`text-[11px] mt-1 ${palette.subText}`}>70%: {msrpNum > 0 ? `$${msrp70}` : '-'}</div>
                    </div>
                    <div>
                      <label className={`block text-xs mb-1 ${palette.subText}`}>Our Price ($)</label>
                      <input
                        type="number"
                        value={ourPriceField}
                        onChange={(e) => setOurPriceField(e.target.value)}
                        className={`w-full px-2 py-1.5 rounded-md text-sm ${palette.inputBg} ${palette.inputText} border ${palette.border} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        placeholder={`${finalPrice.final || 0}`}
                        min={0}
                        step="1"
                      />
                      <div className={`text-[11px] mt-1 ${palette.subText}`}>Blank = use estimate</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 mb-4">
                    <motion.button
                        onClick={onPrint}
                        disabled={finalPrice.final === 0}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors shadow-md ${finalPrice.final > 0 ? `${palette.accentBg} ${palette.accentText}` : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}
                        whileTap={{ scale: finalPrice.final > 0 ? 0.98 : 1 }}
                    >
                        <Printer className="h-4 w-4" /> Print
                    </motion.button>
                    <motion.button
                        onClick={handleCopy}
                        disabled={finalPrice.final === 0}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors shadow-md
                            ${finalPrice.final > 0 ? `bg-gray-600 hover:bg-gray-700 text-white` : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}
                        whileTap={{ scale: finalPrice.final > 0 ? 0.98 : 1 }}
                    >
                        <ClipboardCopy className="h-4 h-4" /> Copy
                    </motion.button>
                </div>
                <h3 className={`text-base font-semibold ${palette.cardTitle} mb-2 border-t pt-3 ${palette.border}`}>Breakdown</h3>
                <AnimatePresence mode="wait">
                    {finalPrice.final > 0 && (
                        <motion.ul
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-1 text-xs"
                        >
                            {Object.entries(finalPrice.details).map(([label, value]) => (
                                <li key={label} className="flex justify-between">
                                    <span className={`${palette.subText}`}>{label}:</span>
                                    <span className={`font-semibold ${value < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                        {value >= 0 ? `+$${value}` : `-$${Math.abs(value)}`}
                                    </span>
                                </li>
                            ))}
                            <li className={`flex justify-between pt-2 border-t mt-2 font-bold text-base ${palette.cardTitle}`}>
                                <span>Total Price:</span>
                                <span className="text-indigo-500">${finalPrice.final}</span>
                            </li>
                        </motion.ul>
                    )}
                    {finalPrice.final === 0 && (
                        <div className={`text-center py-2 ${palette.subText} text-sm`}>
                            <ArrowRight className="h-4 w-4 mx-auto mb-1 text-indigo-400 animate-pulse"/>
                            Start by selecting a Model and Year above.
                        </div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
      </div>
    </div>
  );
}
