
import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { 
  Search, Upload, X, Image as ImageIcon, 
  Tag, Trash2, Copy, Loader2, Save, FileImage, 
  Maximize2, ChevronLeft, ChevronRight, MoreHorizontal, 
  User, Calendar, Layers, ExternalLink, Folder, FolderOpen,
  Sun, Moon, Download, ClipboardCopy, GripHorizontal, Pencil, Plus
} from "lucide-react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost, apiGet, apiDelete, apiPut } from "@/lib/api"; // Assumes apiPut exists, or use apiPost with method PUT
import GlobalLoader from "@/components/ui/GlobalLoader";

// --- Types ---
interface Category {
  id: string;
  label: string;
}

interface StockItem {
  id: string;
  product_name: string;
  grade: string;
  tags: string[];
  urls: string[];
  cloudinary_ids?: string[]; // Needed for editing management
  category_label?: string;
  category_id?: string;
  uploader_name?: string;
  created_at: string;
}

interface UploadItem {
  id: string;
  file?: File; // Optional now (existing images don't have files)
  preview: string;
  status: 'pending' | 'uploading' | 'done' | 'error' | 'existing';
  previewUrl?: string; // The final URL
  cloudinaryId?: string; // The backend ID
}

interface UploadState {
  editingId: string | null; // Null = New, String = Editing
  queue: UploadItem[];
  productName: string;
  grade: string;
  categoryId: string;
  tags: string[];
  tagInput: string;
  uploading: boolean;
  isSaving: boolean;
}

const GRADES = ["A", "B", "C", "D", "P"];

// --- Helpers ---
// Snyk Fix: Hardened optimizeUrl to prevent XSS (XSS-010)
const optimizeUrl = (url: string | undefined, width = 800) => {
  if (!url) return "";
  
  // 1. Sanitize Scheme: Allow only http/https or relative paths
  try {
    // If it's a full URL, validate protocol
    if (url.includes("://")) {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return ""; // Block unsafe schemes like javascript:
      }
    }
  } catch (e) {
    return ""; // Invalid URL format
  }

  // 2. Cloudinary Optimization Logic (Existing)
  if (!url.includes("cloudinary.com")) return url;
  
  const transforms = [`f_jpg`, `q_auto`]; 
  if (width) transforms.push(`w_${width}`, `c_limit`);
  const tStr = transforms.join(",");
  
  if (url.includes("/upload/")) {
    if (!url.includes("/f_auto") && !url.includes("/f_jpg")) {
      return url.replace("/upload/", `/upload/${tStr}/`);
    }
  }
  return url;
};

const isHeic = (filename: string) => /\.(heic|heif)$/i.test(filename);

const formatDate = (dateStr: string) => {
  if (!dateStr) return "Unknown";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
};

const getGradeStyles = (g: string) => {
  switch (g?.toUpperCase()) {
    case 'A': return "bg-emerald-600 border-emerald-400 text-white shadow-emerald-900/20";
    case 'B': return "bg-blue-600 border-blue-400 text-white shadow-blue-900/20";
    case 'C': return "bg-yellow-500 border-yellow-300 text-black shadow-yellow-900/20";
    case 'D': return "bg-orange-600 border-orange-400 text-white shadow-orange-900/20";
    case 'P': return "bg-red-600 border-red-400 text-white shadow-red-900/20";
    default: return "bg-zinc-600 border-zinc-400 text-white shadow-zinc-900/20";
  }
};

const getCardGlow = (g: string) => {
  switch (g?.toUpperCase()) {
    case 'A': return "border-emerald-500/40 shadow-[0_2px_10px_-2px_rgba(16,185,129,0.2)] hover:border-emerald-500 hover:shadow-[0_4px_20px_-4px_rgba(16,185,129,0.4)]";
    case 'B': return "border-blue-500/40 shadow-[0_2px_10px_-2px_rgba(59,130,246,0.2)] hover:border-blue-500 hover:shadow-[0_4px_20px_-4px_rgba(59,130,246,0.4)]";
    case 'C': return "border-yellow-500/40 shadow-[0_2px_10px_-2px_rgba(234,179,8,0.2)] hover:border-yellow-500 hover:shadow-[0_4px_20px_-4px_rgba(234,179,8,0.4)]";
    case 'D': return "border-orange-500/40 shadow-[0_2px_10px_-2px_rgba(249,115,22,0.2)] hover:border-orange-500 hover:shadow-[0_4px_20px_-4px_rgba(249,115,22,0.4)]";
    case 'P': return "border-red-500/40 shadow-[0_2px_10px_-2px_rgba(239,68,68,0.2)] hover:border-red-500 hover:shadow-[0_4px_20px_-4px_rgba(239,68,68,0.4)]";
    default: return "border-border hover:border-primary/50 shadow-sm hover:shadow-md";
  }
};

// --- DRAG & COPY UTILS ---
const handleDragStartExternal = (e: React.DragEvent, url: string, filename: string) => {
  const optimized = optimizeUrl(url, 1600);
  const safeName = `${filename}.jpg`;
  e.dataTransfer.setData("DownloadURL", `image/jpeg:${safeName}:${optimized}`);
  e.dataTransfer.setData("text/plain", optimized);
  e.dataTransfer.setData("text/html", `<img src="${optimized}" alt="${safeName.replace(/"/g, "&quot;")}" />`);
  e.dataTransfer.effectAllowed = "copy";
};

const handleCopyImage = async (url: string) => {
  if (navigator.clipboard && navigator.clipboard.write) {
    try {
      const response = await fetch(optimizeUrl(url, 1600));
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      alert("Image copied!");
      return;
    } catch (err) { console.warn("Clipboard write failed", err); }
  }
  // Fallback omitted for brevity, assume modern browser
  alert("Could not copy image automatically. Right click -> Copy Image.");
};

const handleDownloadAll = async (item: StockItem) => {
  if (!confirm(`Download all ${item.urls.length} images?`)) return;
  for (let i = 0; i < item.urls.length; i++) {
    const url = item.urls[i];
    const name = `${item.product_name.replace(/[^a-z0-9]/gi, "_")}_${i + 1}.jpg`;
    const link = document.createElement("a");
    link.href = optimizeUrl(url, 1600).replace("/upload/", "/upload/fl_attachment,");
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    await new Promise((r) => setTimeout(r, 400));
  }
};

// --- Components ---

// Draggable Sortable Item
const SortableUploadPreview = ({ 
  item, index, onRemove, onMove 
}: { 
  item: UploadItem, 
  index: number, 
  onRemove: () => void,
  onMove: (dragIndex: number, hoverIndex: number) => void 
}) => {
  const [error, setError] = useState(false);
  
  // Distinguish between file preview and URL
  const displaySrc = item.previewUrl ? optimizeUrl(item.previewUrl, 200) : item.preview;
  
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("sortIndex", index.toString());
    // Invisible drag image fix if needed, but browser default is usually ok
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dragIndexStr = e.dataTransfer.getData("sortIndex");
    if (!dragIndexStr) return; // Dropped a file, not a sort item
    const dragIndex = parseInt(dragIndexStr, 10);
    if (dragIndex !== index) {
      onMove(dragIndex, index);
    }
  };

  return (
    <div 
      draggable 
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative aspect-square bg-muted/40 rounded-xl overflow-hidden border group cursor-grab active:cursor-grabbing transition-transform hover:scale-[1.02]"
    >
      <img 
        src={displaySrc} 
        className={cn("w-full h-full object-cover", item.status === 'done' || item.status === 'existing' ? 'opacity-100' : 'opacity-70')} 
        onError={() => setError(true)} 
      />
      
      {item.status === 'uploading' && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
          <Loader2 className="h-6 w-6 text-white animate-spin" />
        </div>
      )}
      
      {item.status === 'error' && (
        <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
            <span className="text-destructive font-bold text-xs">Error</span>
        </div>
      )}

      {/* Drag Handle Indicator */}
      <div className="absolute top-1 left-1 p-1 bg-black/30 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity">
        <GripHorizontal className="h-4 w-4" />
      </div>

      <button 
        onClick={(e) => { e.preventDefault(); onRemove(); }} 
        className="absolute top-1 right-1 p-1.5 bg-black/50 text-white rounded-full hover:bg-destructive transition-colors opacity-0 group-hover:opacity-100 z-20"
      >
        <X className="h-3 w-3" />
      </button>

      {/* Index Badge */}
      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 text-white text-[10px] rounded font-mono opacity-60">
        {index + 1}
      </div>
    </div>
  );
};

const TagAutocomplete = ({ tags, onAdd, onRemove, placeholder = "Add tags...", autoFocus = false }: any) => {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { apiGet<string[]>("/photos/tags/suggest").then(data => setAllTags(data || [])).catch(() => {}); }, []);

  useEffect(() => {
    if (!input.trim()) { setSuggestions([]); setIsOpen(false); return; }
    const lower = input.toLowerCase();
    const matches = allTags.filter(t => t.toLowerCase().includes(lower) && !tags.includes(t));
    setSuggestions(matches); setIsOpen(matches.length > 0);
  }, [input, allTags, tags]);

  useEffect(() => {
    if (isOpen && wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        setCoords({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
    }
  }, [isOpen, input]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(target) && portalRef.current && !portalRef.current.contains(target)) setIsOpen(false);
    };
    window.addEventListener("mousedown", handleClick); window.addEventListener("scroll", () => setIsOpen(false), true);
    return () => { window.removeEventListener("mousedown", handleClick); window.removeEventListener("scroll", () => setIsOpen(false), true); };
  }, []);

  const addTag = (t: string) => {
    const clean = t.trim().toLowerCase();
    if (clean && !tags.includes(clean)) { onAdd(clean); }
    setInput(""); setIsOpen(false); inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); if (input.trim()) addTag(input); } 
    else if (e.key === 'Backspace' && !input && tags.length > 0) { onRemove(tags[tags.length - 1]); }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex flex-wrap gap-2 p-2 bg-background border rounded-md focus-within:ring-1 ring-primary/20 transition-all min-h-[38px]">
        {tags.map((tag: string) => (
          <span key={tag} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-secondary text-secondary-foreground rounded-md border animate-in fade-in zoom-in duration-100">
            {tag} <X className="h-2.5 w-2.5 cursor-pointer hover:text-destructive" onClick={() => onRemove(tag)} />
          </span>
        ))}
        <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} onFocus={() => input && setIsOpen(true)} placeholder={tags.length === 0 ? placeholder : ""} autoFocus={autoFocus} className="flex-1 bg-transparent outline-none text-xs min-w-[60px]" />
      </div>
      {isOpen && createPortal(
        <div ref={portalRef} className="fixed z-[9999] bg-popover border rounded-md shadow-xl overflow-hidden flex flex-col" style={{ top: coords.top, left: coords.left, width: coords.width, maxHeight: '200px' }}>
            <div className="max-h-[200px] overflow-y-auto p-1">
                {suggestions.map(s => (
                <button key={s} className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-sm flex items-center gap-2 transition-colors" onClick={() => addTag(s)}><Tag className="h-3 w-3 opacity-50" /> {s}</button>
                ))}
            </div>
        </div>, document.body
      )}
    </div>
  );
};

const ImageViewer = ({ item, onClose, onEdit }: { item: StockItem, onClose: () => void, onEdit: (item: StockItem) => void }) => {
  const [index, setIndex] = useState(0);
  const urls = item.urls || [];
  const currentUrl = urls[index] || "";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIndex(prev => (prev > 0 ? prev - 1 : prev));
      if (e.key === 'ArrowRight') setIndex(prev => (prev < urls.length - 1 ? prev + 1 : prev));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [urls.length, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="relative w-full max-w-7xl h-full flex flex-col md:flex-row overflow-hidden rounded-lg shadow-2xl bg-black border border-white/5" onClick={e => e.stopPropagation()}>
        
        {/* Main Image View */}
        <div className="flex-1 relative flex items-center justify-center bg-black/40 h-[60vh] md:h-full group">
           <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full md:hidden z-50"><X className="h-6 w-6" /></button>
           {index > 0 && <button onClick={() => setIndex(i => i - 1)} className="absolute left-4 p-3 bg-black/50 text-white rounded-full hover:bg-white/20 z-10 opacity-0 group-hover:opacity-100 transition-opacity"><ChevronLeft className="h-8 w-8" /></button>}
           {index < urls.length - 1 && <button onClick={() => setIndex(i => i + 1)} className="absolute right-4 p-3 bg-black/50 text-white rounded-full hover:bg-white/20 z-10 opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight className="h-8 w-8" /></button>}
           
           {currentUrl && (
             <img 
               src={optimizeUrl(currentUrl, 1600)} 
               alt={item.product_name}
               draggable="true"
               onDragStart={(e) => handleDragStartExternal(e, currentUrl, `${item.product_name}_${index+1}`)}
               className="max-w-full max-h-[85vh] object-contain shadow-2xl cursor-grab active:cursor-grabbing hover:scale-[1.01] transition-transform"
             />
           )}
        </div>
        
        {/* Sidebar */}
        <div className="w-full md:w-[400px] bg-zinc-900 border-l border-white/10 flex flex-col text-zinc-100 h-[40vh] md:h-full">
           <div className="p-6 border-b border-white/10 flex justify-between items-start bg-zinc-800/50">
             <div>
               <h2 className="text-xl font-bold leading-snug text-white">{item.product_name}</h2>
               <div className="flex items-center gap-2 mt-2">
                 <span className={cn("px-2.5 py-0.5 rounded text-xs font-bold border shadow-sm", getGradeStyles(item.grade))}>
                   Grade {item.grade}
                 </span>
                 {item.category_label && <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs font-medium border border-blue-500/30">{item.category_label}</span>}
               </div>
             </div>
             <div className="flex items-center gap-2">
                 <button onClick={() => onEdit(item)} className="p-2 bg-primary/20 hover:bg-primary/40 text-primary border border-primary/30 rounded-full transition-colors" title="Edit / Add Photos">
                    <Pencil className="h-4 w-4" />
                 </button>
                 <button onClick={onClose} className="hidden md:flex p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
             </div>
           </div>
           
           <div className="flex-1 overflow-y-auto p-6 space-y-8">
             <div className="space-y-4">
                <div className="flex items-start gap-3"><div className="p-2 rounded-full bg-white/5 text-white/60"><User className="h-4 w-4" /></div><div><div className="text-xs text-white/40 uppercase tracking-wider font-semibold">Uploaded By</div><div className="text-sm font-medium">{item.uploader_name || "System Admin"}</div></div></div>
             </div>
             
             {item.tags.length > 0 && (
               <div>
                  <h3 className="text-xs text-white/40 uppercase tracking-wider font-bold mb-3 flex items-center gap-2"><Tag className="h-3 w-3" /> Specific Cases</h3>
                  <div className="flex flex-wrap gap-2">{item.tags.map(t => <span key={t} className="px-2.5 py-1 bg-white/10 border border-white/10 rounded-md text-xs font-medium text-white/90">{t}</span>)}</div>
               </div>
             )}
             
             <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-2">
                   <Button onClick={() => handleCopyImage(currentUrl)} className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white border-0">Copy Image</Button>
                   <Button onClick={() => handleDownloadAll(item)} className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-0"><Download className="h-3 w-3 mr-1.5" /> All</Button>
                </div>
             </div>

             <div>
                <h3 className="text-xs text-white/40 uppercase tracking-wider font-bold mb-3">Gallery ({urls.length})</h3>
                <div className="grid grid-cols-4 gap-2">
                  {urls.map((u, i) => (
                    <button 
                      key={u} 
                      draggable="true"
                      onDragStart={(e) => handleDragStartExternal(e, u, `${item.product_name}_${i+1}`)}
                      onClick={() => setIndex(i)} 
                      className={cn("aspect-square rounded-lg overflow-hidden border-2 transition-all relative cursor-grab active:cursor-grabbing", i === index ? "border-primary ring-2 ring-primary/20 opacity-100" : "border-transparent opacity-50 hover:opacity-100 hover:border-white/20")}
                    >
                      <img src={optimizeUrl(u, 200)} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default function PhotoGallery() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catCounts, setCatCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [searchTags, setSearchTags] = useState<string[]>([]);

  const [viewingItem, setViewingItem] = useState<StockItem | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false); // For visual feedback
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  
  const [upState, setUpState] = useState<UploadState>({
    editingId: null,
    queue: [], productName: "", grade: "A", categoryId: "", tags: [], tagInput: "", uploading: false, isSaving: false
  });

  useEffect(() => {
    apiGet<Category[]>("/categories").then(setCategories).catch(console.error);
    apiGet<Record<string, number>>("/photos/categories/counts").then(setCatCounts).catch(console.error);
    apiPost("/photos/maintenance/normalize-tags", {}).catch(() => {});
  }, [items.length]); 

  const toggleTheme = () => {
    const isDark = !darkMode;
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiPost("/photos/search", {
        q: query,
        grade: gradeFilter,
        category_id: categoryFilter,
        tags: searchTags.length > 0 ? searchTags : undefined,
        limit: 50,
        offset: 0
      });
      const safeItems = res.items.map((i: any) => ({
         ...i,
         urls: Array.isArray(i.urls) ? i.urls : (i.url ? [i.url] : []),
         tags: Array.isArray(i.tags) ? i.tags : [] 
      }));
      setItems(safeItems);
      setTotal(res.total);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [query, gradeFilter, categoryFilter, searchTags]);

  useEffect(() => {
    const timer = setTimeout(fetchItems, 400);
    return () => clearTimeout(timer);
  }, [fetchItems]);

  const handleUploadOpen = () => {
    setUpState({ 
        editingId: null, queue: [], productName: "", grade: "A", 
        categoryId: categoryFilter || "", tags: [], tagInput: "", uploading: false, isSaving: false 
    });
    setUploadOpen(true);
  };

  const handleEditItem = (item: StockItem) => {
    setViewingItem(null); // Close viewer
    setUpState({
        editingId: item.id,
        productName: item.product_name,
        grade: item.grade,
        categoryId: item.category_id || "",
        tags: item.tags,
        tagInput: "",
        uploading: false,
        isSaving: false,
        // Populate queue with existing images
        queue: item.urls.map((url, idx) => ({
            id: `existing-${idx}`,
            preview: url,
            previewUrl: url,
            status: 'existing',
            cloudinaryId: item.cloudinary_ids?.[idx] // Assuming API returns this array parallel to URLs
        }))
    });
    setUploadOpen(true);
  };

 const processFiles = async (files: File[]) => {
    // 1. Setup UI state
    const newItems: UploadItem[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: isHeic(file.name) ? "" : URL.createObjectURL(file),
      status: 'uploading'
    }));

    setUpState(prev => ({ ...prev, queue: [...prev.queue, ...newItems] }));

    // 2. Iterate and upload
    for (const item of newItems) {
      if (!item.file) continue;

      try {
        // STEP A: Get Signature from Backend
        // This keeps your API Secret hidden on the server
        const sigRes = await apiGet<{
          signature: string;
          timestamp: number;
          cloud_name: string;
          api_key: string;
          folder: string;
        }>("/photos/signature");

        if (!sigRes) throw new Error("Could not get upload signature");

        // STEP B: Upload to Cloudinary using Signature
        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("api_key", sigRes.api_key);
        formData.append("timestamp", sigRes.timestamp.toString());
        formData.append("signature", sigRes.signature);
        formData.append("folder", sigRes.folder);
        
        // Note: No 'upload_preset' is sent here. We use signed authentication.

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${sigRes.cloud_name}/image/upload`,
          { method: "POST", body: formData }
        );

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Cloudinary Error: ${errText}`);
        }

        const data = await res.json();

        // Update State on Success
        setUpState(prev => ({
          ...prev,
          queue: prev.queue.map(qItem => 
            qItem.id === item.id 
              ? { ...qItem, status: 'done', previewUrl: data.secure_url, cloudinaryId: data.public_id } 
              : qItem
          )
        }));

      } catch (err: any) {
        console.error("Upload failed", err);
        setUpState(prev => ({ 
          ...prev, 
          queue: prev.queue.map(qItem => 
            qItem.id === item.id 
              ? { ...qItem, status: 'error' } 
              : qItem
          ) 
        }));
      }
    }
  }

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
  };

  // --- Drag & Drop Handlers for Modal ---
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only highlight if dragging files, not internal items
    if (e.dataTransfer.types.includes("Files")) setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    // Check if files were dropped
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(Array.from(e.dataTransfer.files));
        return;
    }
  };

  const handleSortMove = (dragIndex: number, hoverIndex: number) => {
    setUpState(prev => {
        const newQueue = [...prev.queue];
        const [movedItem] = newQueue.splice(dragIndex, 1);
        newQueue.splice(hoverIndex, 0, movedItem);
        return { ...prev, queue: newQueue };
    });
  };

  const handleSaveEntry = async () => {
    if (!upState.productName) return alert("Product Name required.");
    const validItems = upState.queue.filter(i => i.status === 'done' || i.status === 'existing');
    if (validItems.length === 0) return alert("Wait for images or add at least one.");

    setUpState(p => ({ ...p, isSaving: true }));

    let finalTags = [...upState.tags];
    if (upState.tagInput.trim()) finalTags.push(upState.tagInput.trim().toLowerCase());

    const payload = {
        product_name: upState.productName,
        grade: upState.grade,
        category_id: upState.categoryId || null,
        tags: finalTags,
        // Send parallel arrays (backend logic should handle mixing existing IDs and new IDs)
        cloudinary_ids: validItems.map(i => i.cloudinaryId),
        urls: validItems.map(i => i.previewUrl) 
    };

    try {
      if (upState.editingId) {
          // UPDATE EXISTING
          await apiPut(`/photos/${upState.editingId}`, payload);
      } else {
          // CREATE NEW
          await apiPost("/photos", payload);
      }
      setUploadOpen(false);
      setUpState({ editingId: null, queue: [], productName: "", grade: "A", categoryId: "", tags: [], tagInput: "", uploading: false, isSaving: false });
      fetchItems();
    } catch (e: any) {
      alert(e.message || "Save failed");
      setUpState(p => ({ ...p, isSaving: false }));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this entry and all its photos?")) return;
    await apiDelete(`/photos/${id}`);
    fetchItems();
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans transition-colors duration-300">
      <header className="h-16 border-b bg-background/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-primary/10 rounded-lg flex items-center justify-center border border-primary/20 text-primary">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-bold leading-none text-lg">Synergy<span className="font-light opacity-70">Stock</span></h1>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Master Photo Library</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full">
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
           </Button>
           <Button onClick={handleUploadOpen} className="gap-2"><Upload className="h-4 w-4" /> Upload Photos</Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-card/30 flex flex-col overflow-y-auto hidden md:flex">
          <div className="p-4 pb-0">
             <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Library</h3>
             <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={query} onChange={e => setQuery(e.target.value)} className="pl-9 h-9 text-xs" placeholder="Search products..." />
             </div>
             <div className="mb-4">
                <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5 block flex items-center gap-1">
                   <Tag className="h-3 w-3" /> Search Tags
                </label>
                <div className="[&_input]:pl-7 [&_input]:h-8 [&_input]:text-xs">
                   <TagAutocomplete tags={searchTags} onAdd={t => setSearchTags(p => [...p, t])} onRemove={t => setSearchTags(p => p.filter(x => x !== t))} placeholder="Filter tags..." />
                </div>
             </div>
          </div>
          {/* ... Categories and Filters (Kept identical to original but omitted for brevity in diff unless requested) ... */}
           <div className="flex-1 overflow-y-auto px-3 space-y-1 border-t pt-2">
             <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Categories</div>
             <button onClick={() => setCategoryFilter(null)} className={cn("w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors", !categoryFilter ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
               <div className="flex items-center gap-2"><FolderOpen className="h-4 w-4" /> All Categories</div>
               <span className="text-xs opacity-60">{total}</span>
             </button>
             {categories.map(cat => {
               const count = catCounts[cat.id] || 0;
               return (
                 <button key={cat.id} onClick={() => setCategoryFilter(cat.id)} className={cn("w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors", categoryFilter === cat.id ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                   <div className="flex items-center gap-2">
                     {count > 0 ? <FolderOpen className={cn("h-4 w-4 fill-current opacity-50")} /> : <Folder className="h-4 w-4" />}
                     {cat.label}
                   </div>
                   {count > 0 && <span className="bg-muted px-1.5 rounded text-[10px] min-w-[20px] text-center">{count}</span>}
                 </button>
               )
             })}
          </div>

          <div className="p-4 border-t bg-muted/10">
             <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Grade</h3>
             <div className="flex flex-wrap gap-1.5">
               {["A", "B", "C", "D"].map(g => (
                 <button key={g} onClick={() => setGradeFilter(g === gradeFilter ? null : g)} className={cn("flex-1 py-1 text-[10px] font-bold rounded border transition-all text-center", gradeFilter === g ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted text-muted-foreground")}>{g}</button>
               ))}
             </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto bg-muted/5">
          <div className="mb-6 flex items-center justify-between">
             <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FolderOpen className="h-4 w-4" />
                <span>{categoryFilter ? categories.find(c => c.id === categoryFilter)?.label : "All Categories"}</span>
                {gradeFilter && <span className="bg-muted px-2 py-0.5 rounded text-xs text-foreground font-bold">Grade {gradeFilter}</span>}
             </div>
             <div className="text-xs font-mono opacity-50">{total} items</div>
          </div>

          {loading ? (
            <div className="h-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="h-[60vh] flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl m-8 bg-muted/10">
              <ImageIcon className="h-16 w-16 opacity-20 mb-4" /><p>No photos found in this folder.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {items.map(item => (
                <motion.div layout key={item.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} 
                  className={cn(
                    "group relative bg-background rounded-xl overflow-hidden transition-all cursor-pointer flex flex-col border-2", 
                    getCardGlow(item.grade), 
                    "hover:-translate-y-1"
                  )}
                  onClick={() => setViewingItem(item)}
                >
                  <div className="aspect-[4/3] w-full bg-muted relative overflow-hidden">
                    <img 
                        src={optimizeUrl(item.urls[0])} 
                        alt={item.product_name} 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                        loading="lazy"
                        draggable="true"
                        onDragStart={(e) => handleDragStartExternal(e, item.urls[0], item.product_name)}
                    />
                    
                    <div className={cn("absolute top-2 right-2 px-2.5 py-1 rounded text-xs font-bold shadow-md border z-10", getGradeStyles(item.grade))}>
                      Grade {item.grade}
                    </div>

                    {item.urls.length > 1 && (
                      <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 backdrop-blur text-white text-[10px] font-medium border border-white/10 flex items-center gap-1">
                        <MoreHorizontal className="h-3 w-3" /> +{item.urls.length - 1}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 className="text-white h-10 w-10 drop-shadow-lg opacity-80" />
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-sm leading-tight line-clamp-2">{item.product_name}</h3>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="text-muted-foreground hover:text-destructive p-1 -mt-1 -mr-1 rounded-md hover:bg-muted transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    {/* ... rest of card details ... */}
                     <div className="flex flex-col gap-1 mb-3 pb-3 border-b border-border/50">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground/80">
                            {item.category_label && <span className="font-medium text-primary">{item.category_label}</span>}
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(item.created_at)}</span>
                        </div>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      {(item.tags || []).slice(0, 3).map(tag => <span key={tag} className="px-1.5 py-0.5 bg-muted rounded text-[10px] text-muted-foreground border max-w-[100px] truncate">{tag}</span>)}
                      {(item.tags || []).length > 3 && <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] text-muted-foreground border">+{item.tags.length - 3}</span>}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>{viewingItem && <ImageViewer item={viewingItem} onClose={() => setViewingItem(null)} onEdit={handleEditItem} />}</AnimatePresence>

      {/* Upload/Edit Modal */}
      <AnimatePresence>
        {uploadOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
               onDragEnter={handleDragEnter} onDragOver={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleDropFiles}
          >
            {dragActive && (
               <div className="absolute inset-0 z-[60] bg-primary/20 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-primary pointer-events-none">
                  <div className="bg-background p-6 rounded-xl shadow-xl flex flex-col items-center animate-bounce">
                     <Upload className="h-12 w-12 text-primary mb-2" />
                     <span className="text-lg font-bold">Drop files to add photos</span>
                  </div>
               </div>
            )}

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="w-full max-w-3xl bg-background border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-4 border-b flex justify-between items-center bg-muted/30">
                <h2 className="font-bold flex items-center gap-2">
                    {upState.editingId ? <Pencil className="h-4 w-4" /> : <Upload className="h-4 w-4" />} 
                    {upState.editingId ? "Edit Stock Entry" : "Upload Stock Photos"}
                </h2>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUploadOpen(false)} disabled={upState.isSaving}><X className="h-4 w-4" /></Button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid gap-4 p-4 bg-muted/20 rounded-lg border">
                  {/* ... Form Inputs ... */}
                   <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-muted-foreground block mb-1">Category</label>
                      <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={upState.categoryId} onChange={e => setUpState(p => ({...p, categoryId: e.target.value}))}>
                         <option value="">(Auto-Detect)</option>
                         {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground block mb-1">Grade</label>
                      <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={upState.grade} onChange={e => setUpState(p => ({...p, grade: e.target.value}))}>{GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}</select>
                    </div>
                  </div>
                  <div><label className="text-xs font-bold text-muted-foreground block mb-1">Product Name</label><Input placeholder="e.g. MacBook Pro M1" value={upState.productName} onChange={e => setUpState(p => ({...p, productName: e.target.value}))} /></div>
                  <div><label className="text-xs font-bold text-muted-foreground block mb-1">Tags</label><TagAutocomplete tags={upState.tags} onAdd={t => setUpState(p => ({...p, tags: [...p.tags, t]}))} onRemove={t => setUpState(p => ({...p, tags: p.tags.filter(x => x !== t)}))} placeholder="Specifics..." /></div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Photos</h3>
                        <span className="text-[10px] text-muted-foreground italic">Drag to reorder</span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <label className="relative aspect-square border-2 border-dashed border-muted-foreground/25 rounded-xl flex flex-col items-center justify-center text-center hover:bg-muted/20 transition-colors cursor-pointer bg-card">
                        <input type="file" multiple accept="image/*,.heic,.heif" className="hidden" onChange={handleFilesSelected} />
                        <div className="h-10 w-10 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-2"><Plus className="h-5 w-5" /></div>
                        <span className="text-xs font-medium">Add Images</span>
                    </label>
                    
                    {/* Sortable Grid */}
                    {upState.queue.map((item, idx) => (
                        <SortableUploadPreview 
                            key={item.id} 
                            index={idx}
                            item={item} 
                            onRemove={() => setUpState(p => ({...p, queue: p.queue.filter(x => x.id !== item.id)}))}
                            onMove={handleSortMove}
                        />
                    ))}
                    </div>
                </div>
              </div>
              <div className="p-4 bg-muted/30 border-t flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                    {upState.queue.length} photos 
                    {upState.queue.some(i => i.status === 'uploading') && " (Uploading...)"}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={upState.isSaving}>Cancel</Button>
                  <Button onClick={handleSaveEntry} disabled={upState.queue.length === 0 || !upState.productName || upState.isSaving || upState.queue.some(i => i.status === 'uploading')}>
                    {upState.isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    {upState.isSaving ? "Saving..." : (upState.editingId ? "Update Entry" : "Save Entry")}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <GlobalLoader loading={upState.isSaving} label="Saving..." />
    </div>
  );
}