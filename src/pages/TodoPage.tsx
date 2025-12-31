import React, { useEffect, useState, useMemo } from "react";
import { 
  CheckCircle2, Circle, Plus, Trash2, AlertCircle, 
  ArrowUp, ArrowDown, Clock, ListTodo, MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { connectLive } from "@/lib/live";

const API_BASE = (import.meta as any).env.VITE_API_URL || "/backend";

// --- Types ---
type Todo = {
  id: number;
  title: string;
  status: "PENDING" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  created_at: string;
  created_by_name: string;
  created_by_avatar?: string;
};

// --- Components ---

const PriorityBadge = ({ p }: { p: string }) => {
  const styles = {
    URGENT: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900",
    HIGH: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900",
    MEDIUM: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900",
    LOW: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800",
  };

  const icons = {
    URGENT: <AlertCircle className="h-3 w-3" />,
    HIGH: <ArrowUp className="h-3 w-3" />,
    MEDIUM: <div className="h-1.5 w-1.5 rounded-full bg-current" />,
    LOW: <ArrowDown className="h-3 w-3" />,
  };

  const key = p as keyof typeof styles;

  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md border", styles[key])}>
      {icons[key]}
      {p}
    </div>
  );
};

export default function TodoPage({ user }: { user?: { id: number | string } }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<"MEDIUM" | "HIGH" | "URGENT">("MEDIUM");
  const [loading, setLoading] = useState(false);

  // --- Fetching ---
  const fetchTodos = async () => {
    try {
      const res = await fetch(`${API_BASE}/todos`);
      if (res.ok) setTodos(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchTodos();
    return connectLive(API_BASE, {
      onEvent: (evt) => {
        if (evt.type === "todo.created") setTodos(p => [evt.data, ...p]);
        if (evt.type === "todo.updated") setTodos(p => p.map(t => t.id === evt.data.id ? { ...t, ...evt.data } : t));
        if (evt.type === "todo.deleted") setTodos(p => p.filter(t => t.id !== evt.data.id));
      }
    });
  }, []);

  // --- Helpers ---
  const getHeaders = () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (user?.id) {
        headers["X-User-ID"] = String(user.id);
    }
    return headers;
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/todos`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ title: newTitle, priority: newPriority })
      });
      setNewTitle("");
      setNewPriority("MEDIUM");
    } finally { setLoading(false); }
  };

  const toggleStatus = async (todo: Todo) => {
    const nextStatus = todo.status === "PENDING" ? "COMPLETED" : "PENDING";
    // Optimistic UI
    setTodos(p => p.map(t => t.id === todo.id ? { ...t, status: nextStatus } : t));
    
    await fetch(`${API_BASE}/todos/${todo.id}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ status: nextStatus })
    });
  };

  const deleteTodo = async (id: number) => {
    if (!confirm("Permanently remove this request?")) return;
    // Optimistic UI
    setTodos(p => p.filter(t => t.id !== id));
    await fetch(`${API_BASE}/todos/${id}`, { method: "DELETE" });
  };

  // --- Derived State ---
  const sortedTodos = useMemo(() => {
    const priorityWeight = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
    return [...todos].sort((a, b) => {
      // 1. Pending first
      if (a.status !== b.status) return a.status === "PENDING" ? -1 : 1;
      // 2. If Pending, sort by Priority
      if (a.status === "PENDING") {
        const pDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
        if (pDiff !== 0) return pDiff;
      }
      // 3. Newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [todos]);

  const pendingCount = todos.filter(t => t.status === "PENDING").length;
  const completedCount = todos.length - pendingCount;
  const progress = todos.length ? (completedCount / todos.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#020617] text-slate-900 dark:text-slate-100 font-sans p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/20">
                <ListTodo className="h-6 w-6 text-white" />
              </div>
              Feature Roadmap
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md leading-relaxed">
              Track requests and system improvements.
            </p>
          </div>
          
          {/* Progress Widget */}
          <div className="w-full md:w-64 space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Progress</span>
              <span>{completedCount}/{todos.length} Done</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>

        {/* Floating Input Bar */}
        <form onSubmit={handleAdd} className="relative z-10">
          <div className="group relative flex items-center bg-white dark:bg-zinc-900 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-black/50 border border-slate-200 dark:border-zinc-800 transition-all focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500">
            
            {/* Priority Selector */}
            <div className="pl-2">
              <select 
                value={newPriority} 
                onChange={(e) => setNewPriority(e.target.value as any)}
                className="h-10 bg-transparent text-xs font-bold uppercase tracking-wide text-slate-500 focus:outline-none cursor-pointer hover:text-blue-600 pl-2 pr-1 rounded-md hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div className="h-6 w-px bg-slate-200 dark:bg-zinc-800 mx-2" />

            {/* Text Input */}
            <Input 
              value={newTitle} 
              onChange={e => setNewTitle(e.target.value)} 
              placeholder="What should we build next?" 
              className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-2 h-14 text-base placeholder:text-slate-400"
              autoFocus
            />

            {/* Add Button */}
            <div className="pr-2">
              <Button 
                type="submit" 
                size="sm" 
                disabled={loading || !newTitle.trim()} 
                className={cn(
                  "h-9 w-9 rounded-lg transition-all", 
                  newTitle.trim() ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md" : "bg-slate-100 text-slate-300 dark:bg-zinc-800 dark:text-zinc-600"
                )}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </form>

        {/* Task List */}
        <div className="space-y-1">
          <AnimatePresence mode="popLayout" initial={false}>
            {sortedTodos.map(todo => (
              <motion.div 
                key={todo.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "group relative flex gap-4 p-4 rounded-xl border transition-all duration-200",
                  todo.status === "COMPLETED" 
                    ? "bg-slate-50 border-transparent dark:bg-zinc-900/40 opacity-75" 
                    : "bg-white border-slate-200 dark:bg-zinc-950 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-800 shadow-sm"
                )}
              >
                {/* Checkbox */}
                <button 
                  onClick={() => toggleStatus(todo)}
                  className={cn(
                    "mt-1 shrink-0 transition-colors focus:outline-none",
                    todo.status === "COMPLETED" ? "text-emerald-500" : "text-slate-300 hover:text-blue-500"
                  )}
                >
                  {todo.status === "COMPLETED" ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
                </button>

                {/* Main Content */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex items-start justify-between gap-4">
                    <span className={cn(
                      "text-[15px] font-medium leading-normal transition-all",
                      todo.status === "COMPLETED" ? "text-slate-500 line-through decoration-slate-300 decoration-2" : "text-slate-900 dark:text-slate-100"
                    )}>
                      {todo.title}
                    </span>
                    
                    {/* Right Side: Badge + Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      {todo.status === "PENDING" && <PriorityBadge p={todo.priority} />}
                      
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" 
                          onClick={() => deleteTodo(todo.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400 font-medium">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
                      <Avatar className="h-3.5 w-3.5">
                        <AvatarImage src={todo.created_by_avatar} />
                        <AvatarFallback className="text-[6px] bg-slate-200 text-slate-600">
                          {todo.created_by_name ? todo.created_by_name[0] : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span>{todo.created_by_name || "Anonymous"}</span>
                    </div>
                    <span className="text-slate-300 dark:text-zinc-700">•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(todo.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {/* Empty State */}
          {todos.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <div className="h-16 w-16 bg-slate-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                <MoreHorizontal className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No requests yet</h3>
              <p className="text-slate-500 max-w-xs mx-auto mt-1">
                The roadmap is clear. Use the input above to add a new feature request.
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}