import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  DollarSign,
  Printer,
  Search,
  Save,
  Plus,
  Trash2,
  Tag,
  Sun,
  Moon,
  Wrench,
  Package,
  List,
  BookOpen,
  Database,
  XCircle,
  Settings,
  ArrowLeft
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { openPrintWindow } from "@/helpers/printLabel";

// --- Theme ---
type Theme = "light" | "dark";
const THEME_KEY = "inStore_pricer_theme";

const getPalette = (theme: Theme) => {
  const isDark = theme === "dark";
  return {
    isDark,
    bg: isDark ? "bg-neutral-950" : "bg-neutral-50",
    text: isDark ? "text-white" : "text-neutral-900",
    subText: isDark ? "text-neutral-400" : "text-neutral-600",
    border: isDark ? "border-neutral-800" : "border-neutral-200",
    card: isDark
      ? "bg-neutral-900/80 border-neutral-800"
      : "bg-white/80 border-neutral-200",
    inputBg: isDark ? "bg-neutral-900" : "bg-white",
    inputBorder: isDark ? "border-neutral-800" : "border-neutral-300",
    accent: "text-indigo-500",
    accentBg: "bg-indigo-600 hover:bg-indigo-700",
    goodBg: "bg-green-600 hover:bg-green-700",
    divider: isDark ? "bg-neutral-800" : "bg-neutral-200",
    chipWarn: "text-red-500 font-semibold bg-red-500/10",
    hover: isDark ? "hover:bg-neutral-800" : "hover:bg-neutral-100",
  };
};

// --- Types ---
interface Product {
  id: string;
  name: string;
  unitPrice: number;
  ourPrice: number;
  defectStatus?: string;
}

interface PricingConfig {
  products: Product[];
}

// --- Mock/Local persistence ---
const initialConfig: PricingConfig = {
  products: [
    { id: "1", name: "iPhone 15 Pro Max 256GB", unitPrice: 1199, ourPrice: 1149, defectStatus: "" },
    { id: "2", name: "Apple Watch Series 9 41mm", unitPrice: 399, ourPrice: 389, defectStatus: "Scuff on body" },
    { id: "3", name: "AirPods Pro 2nd Gen", unitPrice: 249, ourPrice: 235, defectStatus: "" },
    { id: "4", name: "MacBook Air M2 13\"", unitPrice: 1099, ourPrice: 1049, defectStatus: "" },
  ],
};

async function fetchServerConfig(): Promise<PricingConfig> {
  await new Promise((r) => setTimeout(r, 200));
  const raw = localStorage.getItem("inStorePricerConfig");
  const loaded: PricingConfig = raw ? JSON.parse(raw) : initialConfig;
  loaded.products = loaded.products.map((p) => ({ ...p, defectStatus: p.defectStatus || "" }));
  return loaded;
}

async function saveServerConfig(cfg: PricingConfig) {
  await new Promise((r) => setTimeout(r, 150));
  localStorage.setItem("inStorePricerConfig", JSON.stringify(cfg));
}

// --- Utility ---
const roundToCents = (n: number) => Math.round(n * 100) / 100;

// --- Forms ---
function ManualInputForm({
  manualProduct,
  handleManualChange,
  palette,
}: {
  manualProduct: Omit<Product, "id">;
  handleManualChange: (field: keyof Omit<Product, "id">, value: string) => void;
  palette: ReturnType<typeof getPalette>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`max-w-md w-full p-6 rounded-xl border ${palette.border} ${palette.card} shadow-sm backdrop-blur-md h-full`}
    >
      <h2 className={`text-lg font-semibold ${palette.text} flex items-center gap-2 mb-4`}>
        <Wrench className="h-5 w-5 text-indigo-500" /> Manual Entry
      </h2>
      <div className="space-y-4">
        <InputField
          label="Product Name"
          value={manualProduct.name}
          onChange={(e) => handleManualChange("name", e.target.value)}
          placeholder="e.g., Apple Pencil Pro"
          icon={Package}
          palette={palette}
        />
        <InputField
          label="Defect Status (optional)"
          value={manualProduct.defectStatus || ""}
          onChange={(e) => handleManualChange("defectStatus", e.target.value)}
          placeholder="e.g., Minor scratch on screen"
          icon={Wrench}
          palette={palette}
        />
        <div className="grid grid-cols-2 gap-4">
          <InputField
            label="MSRP ($)"
            value={manualProduct.unitPrice}
            onChange={(e) => handleManualChange("unitPrice", e.target.value)}
            placeholder="129.00"
            type="number"
            step="0.01"
            icon={BookOpen}
            palette={palette}
          />
          <InputField
            label="Our Price ($)"
            value={manualProduct.ourPrice}
            onChange={(e) => handleManualChange("ourPrice", e.target.value)}
            placeholder="125.00"
            type="number"
            step="0.01"
            icon={DollarSign}
            palette={palette}
          />
        </div>
      </div>
    </motion.div>
  );
}

function SearchInputForm({
  searchTerm,
  setSearchTerm,
  filteredProducts,
  productExistsInDb,
  handleSelectProduct,
  onOpenSettings,
  palette,
  inputRef,
}: {
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  filteredProducts: Product[];
  productExistsInDb: boolean;
  handleSelectProduct: (p: Product) => void;
  onOpenSettings: () => void;
  palette: ReturnType<typeof getPalette>;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`max-w-md w-full p-6 rounded-xl border ${palette.border} ${palette.card} shadow-sm backdrop-blur-md h-full`}
    >
      <h2 className={`text-lg font-semibold ${palette.text} flex items-center gap-2 mb-4`}>
        <Search className="h-5 w-5 text-indigo-500" /> Search Product
      </h2>
      <div className="space-y-4">
        <div className="relative">
          <Search className={`h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 ${palette.accent}`} />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Start typing (e.g., iPhone 15)…"
            className={`w-full pl-10 pr-3 py-2 rounded-lg border ${palette.inputBorder} ${palette.inputBg} focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm`}
          />
        </div>
        <AnimatePresence>
          {searchTerm.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className={`rounded-lg border ${palette.border} ${palette.card}`}
            >
              {productExistsInDb && filteredProducts.length === 0 ? (
                <div className="p-3 text-sm ${palette.subText}">Exact match selected.</div>
              ) : filteredProducts.length > 0 ? (
                <div className="max-h-56 overflow-auto divide-y divide-neutral-800/40 custom-scrollbar">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectProduct(p)}
                      className={`w-full text-left p-3 ${palette.hover} flex items-center justify-between text-sm`}
                    >
                      <span className="truncate">{p.name}</span>
                      <Tag className={`h-4 w-4 ${palette.accent}`} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  <div className={`text-sm ${palette.subText}`}>“{searchTerm}” not found.</div>
                  <button
                    onClick={onOpenSettings}
                    className={`w-full inline-flex items-center justify-center space-x-2 px-3 py-1.5 rounded-lg ${palette.accentBg} text-white text-sm`}
                  >
                    <Plus className="h-4 w-4" /> <span>Add to Database</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  step,
  icon: Icon,
  palette,
  className,
}: {
  label: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: string;
  step?: string;
  icon: any;
  palette: ReturnType<typeof getPalette>;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={`block text-sm font-medium mb-1 ${palette.subText} flex items-center`}>
        <Icon className="h-4 w-4 mr-1 text-indigo-500" /> {label}
      </label>
      <input
        type={type}
        step={step}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full px-3 py-2 rounded-lg border ${palette.inputBorder} ${palette.inputBg} focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm`}
      />
    </div>
  );
}

// --- Preview ---
function PricePreview({
  currentProduct,
  mode,
  palette,
}: {
  currentProduct: Omit<Product, "id"> | null;
  mode: "manual" | "search";
  palette: ReturnType<typeof getPalette>;
}) {
  const currentDate = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const hasDefect = !!currentProduct?.defectStatus;

  // Animation variants for container
  const containerVariants = {
    initial: { opacity: 0, scale: 0.98, y: 6 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 220, damping: 22, duration: 0.4 } },
    exit: { opacity: 0, scale: 0.98, y: -6, transition: { duration: 0.3 } },
  };

  // Animation variants for child elements
  const childVariants = {
    initial: { opacity: 0, y: 4 },
    animate: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 220, damping: 22, delay: i * 0.1 },
    }),
    exit: { opacity: 0, y: -4, transition: { duration: 0.2 } },
  };

  return (
    <motion.div
      key={currentProduct ? "has" : "empty"}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className={`max-w-md w-full p-6 rounded-xl border ${palette.border} ${palette.card} shadow-sm backdrop-blur-md h-full`}
    >
      <h2 className={`text-lg font-semibold ${palette.text} flex items-center gap-2 mb-4`}>
        <List className="h-5 w-5 text-indigo-500" /> Price Preview
      </h2>
      <AnimatePresence mode="wait">
        {currentProduct?.name && currentProduct.ourPrice > 0 ? (
          <motion.div
            key="preview-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <h3 className="text-base font-medium truncate">{currentProduct.name}</h3>
            {currentProduct.defectStatus ? (
              <span className={`text-xs px-2 py-1 rounded ${palette.chipWarn}`}>
                DEFECT: {currentProduct.defectStatus}
              </span>
            ) : null}
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">
                <span className={`${palette.subText}`}>MSRP:</span>
                <span className="font-semibold">${currentProduct.unitPrice.toFixed(2)}</span>
              </li>
              <li className={`flex justify-between text-lg pt-2 border-t ${palette.border}`}>
                <span className="font-bold">OUR PRICE:</span>
                <span className="font-extrabold text-2xl text-indigo-500">${currentProduct.ourPrice.toFixed(2)}</span>
              </li>
            </ul>
            <div className={`pt-4 border-t ${palette.border}`}>
              <h4 className={`text-sm font-semibold ${palette.text} mb-2`}>Print Preview</h4>
              <motion.div
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className={`relative w-[4in] h-[1.6in] box-border p-[0.1in_0.6in] text-[12px] font-arial bg-neutral-100/10 rounded-lg shadow-sm ${hasDefect ? 'compact-label' : ''}`}
              >
                <motion.img
                  src="https://images.squarespace-cdn.com/content/v1/65b9315703a0c658ffb46c19/8d1b66b8-e3b1-41f0-9ebb-a116c5a9712e/Synergy-logo-icon.png"
                  alt="Synergy Logo"
                  className="absolute top-[0.1in] right-[0.2in] w-[0.75in] h-auto z-[1] pointer-events-none"
                  variants={childVariants}
                  custom={0}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  onError={() => console.error("Failed to load logo in print preview")}
                />
                <motion.div
                  className={`product ${hasDefect ? 'text-[15px]' : 'text-[16px]'} font-bold mb-[6px] z-[2] relative`}
                  variants={childVariants}
                  custom={1}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {currentProduct.name}
                </motion.div>
                {currentProduct.defectStatus ? (
                  <motion.div
                    className="defect text-[9px] font-bold text-[#cc0000] mb-[2px] p-[2px_4px] border border-dashed border-[#cc0000] inline-block leading-[1.2] z-[2] relative"
                    variants={childVariants}
                    custom={2}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    DEFECT: {currentProduct.defectStatus}
                  </motion.div>
                ) : null}
                <motion.div
                  className={`msrp ${hasDefect ? 'text-[11px]' : 'text-[12px]'} mb-[4px] z-[2] relative`}
                  variants={childVariants}
                  custom={currentProduct.defectStatus ? 3 : 2}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  MSRP: ${currentProduct.unitPrice.toFixed(2)}
                </motion.div>
                <motion.div
                  className={`our-price ${hasDefect ? 'text-[14px]' : 'text-[16px]'} mb-[4px] z-[2] relative`}
                  variants={childVariants}
                  custom={currentProduct.defectStatus ? 4 : 3}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  OUR PRICE: <span className={`price ${hasDefect ? 'text-[30px]' : 'text-[38px]'} font-bold`}>${currentProduct.ourPrice.toFixed(2)}</span>
                </motion.div>
                <motion.div
                  className="date text-[8px] absolute bottom-[0.1in] right-[0.25in] z-[2] relative"
                  variants={childVariants}
                  custom={currentProduct.defectStatus ? 5 : 4}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {currentDate}
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="no-preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-4 text-sm ${palette.subText}"
          >
            <List className="h-5 w-5 mx-auto mb-2 text-indigo-400 animate-pulse" />
            {mode === "manual"
              ? "Enter product details to preview the label."
              : "Search a product or switch to Manual."}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// --- Settings Modal ---
function SettingsModal({
  products,
  onSave,
  onClose,
  palette,
}: {
  products: Product[];
  onSave: (products: Product[]) => void;
  onClose: () => void;
  palette: ReturnType<typeof getPalette>;
}) {
  const [editingProducts, setEditingProducts] = useState<Product[]>(products);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddProduct = () => {
    const newId = (Math.max(0, ...editingProducts.map((p) => Number(p.id))) + 1).toString();
    setEditingProducts([
      { id: newId, name: "NEW PRODUCT", unitPrice: 0, ourPrice: 0, defectStatus: "" },
      ...editingProducts,
    ]);
  };

  const handleUpdateProduct = (id: string, field: keyof Product, value: string) => {
    setEditingProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (field === "name" || field === "defectStatus") return { ...p, [field]: value };
        return { ...p, [field]: parseFloat(value) || 0 } as Product;
      })
    );
  };

  const handleDeleteProduct = (id: string) => {
    setEditingProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const clean = editingProducts.map((p) => ({ ...p, defectStatus: p.defectStatus?.trim() || "" }));
    await onSave(clean);
    setIsSaving(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.96, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 20 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className={`w-full max-w-2xl rounded-xl border ${palette.border} ${palette.card} shadow-xl backdrop-blur-md p-6 flex flex-col max-h-[90vh]`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-indigo-500/30">
          <h2 className="text-lg font-semibold text-indigo-400">
            Product Database
          </h2>
          <motion.button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-red-500/10 text-red-400"
            whileTap={{ scale: 0.95 }}
            title="Close"
            aria-label="Close"
          >
            <XCircle className="h-6 w-6" />
          </motion.button>
        </div>
        <div className="flex-grow overflow-y-auto pr-1 space-y-3 custom-scrollbar">
          <div className={`text-xs uppercase tracking-wide ${palette.subText} flex items-center px-3 py-2 rounded-lg border ${palette.border}`}>
            <div className="w-1/2">Product</div>
            <div className="w-1/2 hidden sm:block">Defect</div>
            <div className="w-32 text-right">MSRP</div>
            <div className="w-32 text-right">Our</div>
            <div className="w-10" />
          </div>
          {editingProducts.length === 0 && (
            <div className="text-center py-10 ${palette.subText} text-sm">No products yet. Add one.</div>
          )}
          {editingProducts.map((p) => (
            <div key={p.id} className={`flex items-center px-3 py-2 rounded-lg border ${palette.border} ${palette.card}`}>
              <input
                type="text"
                value={p.name}
                onChange={(e) => handleUpdateProduct(p.id, "name", e.target.value)}
                placeholder="Product Name"
                className={`w-1/2 bg-transparent focus:outline-none px-2 py-1 rounded text-sm`}
              />
              <input
                type="text"
                value={p.defectStatus || ""}
                onChange={(e) => handleUpdateProduct(p.id, "defectStatus", e.target.value)}
                placeholder="Defect status"
                className={`w-1/2 hidden sm:block bg-transparent focus:outline-none px-2 py-1 rounded text-sm`}
              />
              <input
                type="number"
                step="0.01"
                value={p.unitPrice}
                onChange={(e) => handleUpdateProduct(p.id, "unitPrice", e.target.value)}
                placeholder="MSRP"
                className={`w-32 text-right bg-transparent focus:outline-none px-2 py-1 rounded text-sm`}
              />
              <input
                type="number"
                step="0.01"
                value={p.ourPrice}
                onChange={(e) => handleUpdateProduct(p.id, "ourPrice", e.target.value)}
                placeholder="Our Price"
                className={`w-32 text-right bg-transparent focus:outline-none px-2 py-1 rounded text-sm`}
              />
              <motion.button
                onClick={() => handleDeleteProduct(p.id)}
                className="w-10 flex items-center justify-center p-2 rounded-lg text-red-500 hover:bg-red-500/10"
                whileTap={{ scale: 0.95 }}
                title="Delete"
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </motion.button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-4 border-t border-neutral-800/60">
          <motion.button
            onClick={handleAddProduct}
            className={`inline-flex items-center space-x-2 px-3 py-2 rounded-lg ${palette.accentBg} text-white text-sm`}
            whileTap={{ scale: 0.95 }}
          >
            <Plus className="h-4 w-4" /> <span>Add New</span>
          </motion.button>
          <motion.button
            onClick={handleSave}
            disabled={isSaving}
            className={`inline-flex items-center space-x-2 px-3 py-2 rounded-lg text-sm ${
              isSaving ? "bg-neutral-600 text-neutral-300" : `${palette.goodBg} text-white`
            }`}
            whileTap={{ scale: isSaving ? 1 : 0.95 }}
          >
            <Save className={`h-4 w-4 ${isSaving ? "animate-spin" : ""}`} />
            <span>{isSaving ? "Saving…" : "Save"}</span>
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- Main ---
export default function InStorePricer() {
  // Theme
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    return saved === "light" || saved === "dark" ? saved : "dark";
  });
  const palette = getPalette(theme);
  const toggleTheme = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    localStorage.setItem(THEME_KEY, t);
  };

  // Data
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  type Mode = "manual" | "search";
  const [mode, setMode] = useState<Mode>("manual");

  // Manual + Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [manualProduct, setManualProduct] = useState<Omit<Product, "id">>({
    name: "",
    unitPrice: 0,
    ourPrice: 0,
    defectStatus: "",
  });

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Load config
  useEffect(() => {
    fetchServerConfig().then((cfg) => {
      setConfig(cfg);
      setLoading(false);
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlePrint();
      }
      if (e.key === "/" && mode === "search") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  // Filtered products for suggestions
  const filteredProducts = useMemo(() => {
    if (!config || searchTerm.length < 1) return [];
    return config.products
      .filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .slice(0, 8);
  }, [config, searchTerm]);

  const currentProduct = useMemo<Omit<Product, "id"> | null>(() => {
    if (mode === "manual") return manualProduct.name ? manualProduct : null;
    const matched = config?.products.find(
      (p) => p.name.toLowerCase() === searchTerm.toLowerCase()
    );
    if (matched) {
      const { id, ...rest } = matched;
      return { ...rest, defectStatus: rest.defectStatus || "" };
    }
    return null;
  }, [mode, searchTerm, config, manualProduct]);

  const productExistsInDb = useMemo(() => {
    return !!config?.products.some(
      (p) => p.name.toLowerCase() === searchTerm.toLowerCase()
    );
  }, [config, searchTerm]);

  // Handlers
  const handlePrint = useCallback(() => {
    if (!currentProduct || isPrinting) return;
    setIsPrinting(true);
    const date = new Date().toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
    openPrintWindow({
      productName: currentProduct.name,
      unitPrice: currentProduct.unitPrice.toFixed(2),
      ourPrice: currentProduct.ourPrice.toFixed(2),
      date,
      defectStatus: currentProduct.defectStatus || "",
    });
    setTimeout(() => setIsPrinting(false), 1400);
  }, [currentProduct, isPrinting]);

  const handleManualChange = (
    field: keyof Omit<Product, "id">,
    value: string
  ) => {
    setManualProduct((prev) => {
      if (field === "name" || field === "defectStatus") {
        return { ...prev, [field]: value };
      }
      const num = parseFloat(value) || 0;
      return { ...prev, [field]: num };
    });
  };

  const handleSelectProduct = (p: Product) => {
    setSearchTerm(p.name);
    const { id, ...rest } = p;
    setManualProduct({ ...rest, defectStatus: rest.defectStatus || "" });
  };

  async function handleSaveConfig(newProducts: Product[]) {
    await saveServerConfig({ products: newProducts });
    setConfig({ products: newProducts });
  }

  const handleBackToUtilities = () => {
    window.location.href = "/utilities";
  };

  // Custom scrollbar style to match MacbookPricer
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
    .font-arial {
      font-family: Arial, sans-serif;
    }
  `;

  // --- Render ---
  if (loading) {
    return (
      <div className={`flex items-center justify-center h-screen ${palette.bg}`}>
        <div className="text-sm ${palette.subText}">Loading…</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${palette.bg} ${palette.text} transition-colors py-6 px-4 sm:px-6 lg:px-8`}>
      <style dangerouslySetInnerHTML={{ __html: customScrollbarStyle }} />
      
      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsModal
            products={config?.products || []}
            onSave={(p) => {
              handleSaveConfig(p);
              setIsSettingsOpen(false);
            }}
            onClose={() => setIsSettingsOpen(false)}
            palette={palette}
          />
        )}
      </AnimatePresence>

      <div className="max-w-5xl mx-auto">
        {/* Header (Adapted from MacbookPricer with Print button) */}
        <header className={`sticky top-0 z-20 transition-colors duration-300 pt-4 pb-0`}>
          <div
            className={`max-w-5xl mx-auto rounded-xl overflow-hidden border-b-0 border ${
              theme === "dark"
                ? "bg-neutral-900/80 border-neutral-800"
                : "bg-white/80 border-neutral-200"
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
                    theme === "dark" ? "text-neutral-300" : "text-neutral-700"
                  } text-sm font-semibold tracking-tight mt-0.5`}
                >
                  In-Store Pricer Utility
                </h1>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <a
                href="/utilities"
                className={`inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200 ${
                  theme === "dark"
                    ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                    : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
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
                  theme === "dark" ? "bg-neutral-700/50" : "bg-neutral-300"
                } h-6 w-px`}
                aria-hidden
              />
              <motion.button
                onClick={() => setIsSettingsOpen(true)}
                className={`inline-flex items-center justify-center p-2 rounded-lg transition-colors duration-200 ${
                  theme === "dark"
                    ? "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                    : "text-neutral-700 hover:bg-neutral-100"
                } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  theme === "dark"
                    ? "focus:ring-indigo-500 focus:ring-offset-neutral-900"
                    : "focus:ring-indigo-500"
                }`}
                whileTap={{ scale: 0.95 }}
                title="Open Product Database"
                aria-label="Open Product Database"
              >
                <Settings className="h-5 w-5" />
              </motion.button>
              <motion.button
                onClick={toggleTheme}
                className={`inline-flex items-center justify-center p-2 rounded-lg transition-colors duration-200 ${
                  theme === "dark"
                    ? "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                    : "text-neutral-700 hover:bg-neutral-100"
                } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  theme === "dark"
                    ? "focus:ring-indigo-500 focus:ring-offset-neutral-900"
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
              <motion.button
                onClick={handlePrint}
                disabled={!currentProduct || isPrinting}
                className={`inline-flex items-center justify-center p-2 rounded-lg transition-colors duration-200 ${
                  currentProduct && !isPrinting
                    ? `${theme === "dark" ? "text-neutral-300 hover:bg-neutral-800 hover:text-white" : "text-neutral-700 hover:bg-neutral-100"}`
                    : "text-neutral-500 cursor-not-allowed"
                } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  theme === "dark"
                    ? "focus:ring-indigo-500 focus:ring-offset-neutral-900"
                    : "focus:ring-indigo-500"
                }`}
                whileTap={{ scale: currentProduct && !isPrinting ? 0.95 : 1 }}
                title="Print Label (⌘/Ctrl+P)"
                aria-label="Print Label"
              >
                <Printer className="h-5 w-5" />
              </motion.button>
            </div>
          </div>
        </header>

        <main className="py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Mode Tabs and Input Form */}
            <div className="space-y-6">
              {/* Mode Tabs */}
              <div className="flex justify-center">
                <div className={`max-w-md w-full p-4 rounded-xl border ${palette.border} ${palette.card} shadow-sm backdrop-blur-md`}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMode("manual")}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                        mode === "manual" ? `${palette.accentBg} text-white` : `${palette.hover} ${palette.text}`
                      }`}
                    >
                      <span className="inline-flex items-center justify-center gap-2">
                        <Wrench className="h-4 w-4" /> Manual
                      </span>
                    </button>
                    <button
                      onClick={() => setMode("search")}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                        mode === "search" ? `${palette.accentBg} text-white` : `${palette.hover} ${palette.text}`
                      }`}
                    >
                      <span className="inline-flex items-center justify-center gap-2">
                        <Search className="h-4 w-4" /> Search
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Input Form (Manual or Search) */}
              <div className="flex justify-center">
                <AnimatePresence mode="wait">
                  {mode === "manual" ? (
                    <ManualInputForm
                      key="manual"
                      manualProduct={manualProduct}
                      handleManualChange={handleManualChange}
                      palette={palette}
                    />
                  ) : (
                    <SearchInputForm
                      key="search"
                      searchTerm={searchTerm}
                      setSearchTerm={setSearchTerm}
                      filteredProducts={filteredProducts}
                      productExistsInDb={productExistsInDb}
                      handleSelectProduct={handleSelectProduct}
                      onOpenSettings={() => setIsSettingsOpen(true)}
                      palette={palette}
                      inputRef={searchInputRef}
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Right Column: Price Preview */}
            <div className="flex justify-center">
              <PricePreview currentProduct={currentProduct} mode={mode} palette={palette} />
            </div>
          </div>

          {/* Print Button */}
          <div className="mt-6 flex justify-center">
            <motion.div
              className={`max-w-md w-full p-4 rounded-xl border ${palette.border} ${palette.card} shadow-sm backdrop-blur-md`}
            >
              <motion.button
                onClick={handlePrint}
                disabled={!currentProduct || isPrinting}
                className={`w-full py-3 rounded-lg text-sm font-semibold transition ${
                  currentProduct && !isPrinting
                    ? `${palette.goodBg} text-white`
                    : `bg-neutral-200/50 text-neutral-500 cursor-not-allowed`
                }`}
                whileTap={currentProduct && !isPrinting ? { scale: 0.98 } : {}}
                title="Print (⌘/Ctrl+P)"
                aria-label="Print Price Label"
              >
                <span className="inline-flex items-center justify-center space-x-2">
                  <Printer className="h-5 w-5" />
                  <span>{isPrinting ? "Printing…" : "Print Price Label"}</span>
                </span>
              </motion.button>
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}