import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Star, Calculator, DollarSign, 
  ArrowRight, Sun, Moon, Home, Wrench, 
  Terminal, Sparkles, LayoutGrid, X, 
  Activity, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

// --- Types ---
type CategoryType = "Finance" | "Hardware" | "Productivity" | "Logistics" | "Technical";

interface Tool {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  category: CategoryType;
}

// --- Tool Definitions ---
const TOOLS: Tool[] = [
  {
    id: "macbook-pricer",
    title: "MacBook Pricer",
    description: "Instant resale value estimation for Apple silicon and Intel MacBooks.",
    icon: DollarSign,
    path: "/utilities/macbook-pricer",
    category: "Finance",
  },
  {
    id: "in-store-pricer",
    title: "In-Store Pricer",
    description: "Calculate retail pricing, margins, and taxes for store inventory.",
    icon: Calculator,
    path: "/utilities/in-store-pricer",
    category: "Finance",
  },
  // Added a few placeholders to demonstrate the layout visuals better
  /*
  {
    id: "api-health",
    title: "API Diagnostics",
    description: "Real-time latency monitoring and database connection status.",
    icon: Activity,
    path: "/utilities/status",
    category: "Technical",
  },
  */
];

// --- Helpers ---
const getCategoryStyles = (cat: CategoryType) => {
  switch (cat) {
    case "Finance": return {
      badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      glow: "group-hover:shadow-emerald-500/20 group-hover:border-emerald-500/50",
      gradient: "from-emerald-500/20 to-transparent"
    };
    case "Technical": return {
      badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      glow: "group-hover:shadow-blue-500/20 group-hover:border-blue-500/50",
      gradient: "from-blue-500/20 to-transparent"
    };
    default: return {
      badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
      iconBg: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
      glow: "group-hover:shadow-orange-500/20 group-hover:border-orange-500/50",
      gradient: "from-orange-500/20 to-transparent"
    };
  }
};

// --- Components ---

const ToolCard = ({ 
  tool, 
  isFavorite, 
  onToggleFavorite 
}: { 
  tool: Tool; 
  isFavorite: boolean; 
  onToggleFavorite: (id: string) => void; 
}) => {
  const navigate = useNavigate();
  const styles = getCategoryStyles(tool.category);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -5, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(tool.path)}
      className={cn(
        "group relative flex flex-col p-6 rounded-2xl border bg-card/50 backdrop-blur-xl shadow-sm transition-all duration-300 cursor-pointer overflow-hidden",
        styles.glow // Apply color-specific border/shadow glow on hover
      )}
    >
      {/* Top Gradient Line */}
      <div className={cn("absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-50 transition-opacity group-hover:opacity-100", styles.gradient)} />
      
      {/* Background Sheen Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Header */}
      <div className="flex items-start justify-between relative z-10">
        <div className={cn("p-3 rounded-2xl border border-transparent transition-all duration-300 group-hover:scale-110", styles.iconBg)}>
          <tool.icon className="h-6 w-6" />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(tool.id);
          }}
          className={cn(
            "p-2 rounded-full transition-all duration-200 hover:bg-muted",
            isFavorite ? "text-yellow-400" : "text-muted-foreground/30 hover:text-yellow-400"
          )}
        >
          <Star className={cn("h-5 w-5 transition-transform active:scale-90", isFavorite && "fill-current")} />
        </button>
      </div>

      {/* Content */}
      <div className="mt-5 relative z-10 flex-1">
        <h3 className="font-bold text-lg tracking-tight text-foreground group-hover:text-primary transition-colors">
          {tool.title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {tool.description}
        </p>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between relative z-10">
        <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md border", styles.badge)}>
          {tool.category}
        </span>
        <div className="flex items-center text-xs font-semibold text-primary/80 group-hover:text-primary translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
          Open Tool <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </div>
      </div>
    </motion.div>
  );
};

export default function UtilitiesHub() {
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("tool_favorites") || "[]");
    } catch { return []; }
  });

  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      return localStorage.getItem("theme") === "dark" || 
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch { return false; }
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
      localStorage.setItem("tool_favorites", JSON.stringify(next));
      return next;
    });
  };

  const filteredTools = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return TOOLS;
    return TOOLS.filter(t => 
      t.title.toLowerCase().includes(q) || 
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const favoriteTools = useMemo(() => filteredTools.filter(t => favorites.includes(t.id)), [filteredTools, favorites]);
  const otherTools = useMemo(() => filteredTools.filter(t => !favorites.includes(t.id)), [filteredTools, favorites]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 transition-colors duration-300 relative overflow-x-hidden">
      
      {/* ──────────────────────────────────────────────────────────────────────────
          Background Architecture (The "Technical" Look)
         ────────────────────────────────────────────────────────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Dot Grid Pattern */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
        <div 
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.08]"
          style={{ 
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '24px 24px' 
          }}
        />
        
        {/* Ambient Glows */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] mix-blend-screen opacity-50 dark:opacity-30" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[140px] mix-blend-screen opacity-50 dark:opacity-30" />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          HEADER
         ────────────────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 h-16 border-b border-border/40 bg-background/80 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
             <div className="relative group">
               <div className="absolute inset-0 bg-primary blur rounded-lg opacity-20 group-hover:opacity-40 transition-opacity" />
               <div className="relative h-9 w-9 bg-background rounded-lg flex items-center justify-center border border-primary/20 shadow-sm">
                  <Wrench className="h-5 w-5 text-primary" />
               </div>
             </div>
             <div className="flex flex-col">
                <span className="font-bold tracking-tight text-base leading-none">Synergy</span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Utilities</span>
             </div>
          </div>
        </div>

        {/* Search Omnibox */}
        <div className="flex-1 max-w-lg px-8 hidden sm:block">
          <div className="relative group">
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-full blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input 
              type="text"
              placeholder="Type to search tools..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-10 rounded-full bg-muted/40 border border-transparent focus:bg-background focus:border-primary/30 focus:ring-2 focus:ring-primary/10 transition-all outline-none placeholder:text-muted-foreground/60 shadow-inner"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
           <button 
             onClick={() => window.location.href = "/"}
             className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors relative group"
             title="Home"
           >
             <Home className="h-5 w-5" />
             <span className="sr-only">Home</span>
           </button>
           <div className="h-4 w-px bg-border/60 mx-1" />
           <button 
             onClick={() => setIsDarkMode(!isDarkMode)}
             className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
             title="Toggle Theme"
           >
             <AnimatePresence mode="wait" initial={false}>
               <motion.div
                 key={isDarkMode ? 'dark' : 'light'}
                 initial={{ y: -10, opacity: 0 }}
                 animate={{ y: 0, opacity: 1 }}
                 exit={{ y: 10, opacity: 0 }}
                 transition={{ duration: 0.2 }}
               >
                 {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
               </motion.div>
             </AnimatePresence>
           </button>
        </div>
      </header>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CONTENT
         ────────────────────────────────────────────────────────────────────────── */}
      <main className="relative z-10 p-6 md:p-8 max-w-7xl mx-auto space-y-12">
        
        {/* Mobile Search */}
        <div className="sm:hidden">
           <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Search tools..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary/30"
            />
          </div>
        </div>

        {/* Favorites Section */}
        <AnimatePresence>
          {favorites.length > 0 && favoriteTools.length > 0 && (
            <motion.section 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-5"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest px-1">
                <Zap className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                Quick Access
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {favoriteTools.map(tool => (
                  <ToolCard 
                    key={tool.id} 
                    tool={tool} 
                    isFavorite={true} 
                    onToggleFavorite={toggleFavorite} 
                  />
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* All Tools Section */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest px-1">
            <LayoutGrid className="h-4 w-4" />
            {searchQuery ? "Search Results" : "Available Utilities"}
          </div>
          
          {otherTools.length > 0 ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {otherTools.map(tool => (
                  <ToolCard 
                    key={tool.id} 
                    tool={tool} 
                    isFavorite={false} 
                    onToggleFavorite={toggleFavorite} 
                  />
                ))}
             </div>
          ) : (
            filteredTools.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-border/60 rounded-3xl bg-muted/5 backdrop-blur-sm"
              >
                <div className="h-16 w-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                   <Search className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <h3 className="text-xl font-bold text-foreground">No tools found</h3>
                <p className="text-muted-foreground max-w-xs mt-2 text-sm">
                  We couldn't find any utilities matching "{searchQuery}".
                </p>
                <button 
                  onClick={() => setSearchQuery("")}
                  className="mt-6 px-6 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-full text-sm font-semibold transition-colors"
                >
                  Clear search
                </button>
              </motion.div>
            )
          )}
        </section>

      </main>
    </div>
  );
}