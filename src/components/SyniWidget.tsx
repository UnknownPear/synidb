import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, Send, Bot, User, Loader2, X, MessageSquare, Lightbulb, 
  ChevronRight, CornerDownRight, Menu, AlertTriangle, CheckCircle2, Zap, ArrowRight,
  Plus, Mic
} from "lucide-react";
import { apiPost, cls } from "@/lib/api";
import { CustomLoader } from '@/components/ui/CustomLoader';

export type Insight = {
  id: string;
  title: string;
  message: string;
  severity: "critical" | "warning" | "info" | "success";
  count: number;
  icon: string;
  action?: { label: string; link: string };
};

type ChatMsg = { role: "user" | "assistant"; content: string };

type Props = {
  insights: Insight[];
  userName?: string;
  onReferenceClick?: (synergyId: string) => void;
};

// --- ROBUST LINK PARSER ---
function ParsedMessage({ content, onLinkClick }: { content: string; onLinkClick: (id: string) => void }) {
  const combinedRegex = /\[([A-Z0-9]{2,6}-\d{5})\]|🆔\s*([A-Z0-9]{2,6}-\d{5})/gi;
  if (!content) return null;

  const parts = content.split(combinedRegex);
  const matches = [...content.matchAll(combinedRegex)];

  if (matches.length === 0) return <span className="whitespace-pre-wrap">{content}</span>;

  const elements = [];
  let matchIndex = 0;
  let lastIndex = 0;

  for (const match of matches) {
    const start = match.index!;
    const end = start + match[0].length;
    const id = match[1] || match[2];

    if (start > lastIndex) {
      elements.push(<span key={`txt-${lastIndex}`}>{content.slice(lastIndex, start)}</span>);
    }

    elements.push(
      <button 
        key={`btn-${start}`}
        onClick={() => onLinkClick(id)}
        className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 -translate-y-px rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 font-mono text-xs font-bold hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors cursor-pointer align-middle border border-violet-200 dark:border-violet-700 select-none transform active:scale-95"
        title={`Jump to ${id}`}
      >
        {id} <CornerDownRight className="h-3 w-3 opacity-60" />
      </button>
    );

    lastIndex = end;
  }

  if (lastIndex < content.length) {
    elements.push(<span key={`txt-end`}>{content.slice(lastIndex)}</span>);
  }

  return <span className="whitespace-pre-wrap leading-relaxed block">{elements}</span>;
}

export default function SyniWidget({ insights, userName, onReferenceClick }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "insights">("chat");
  
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Hi! I'm Syni. I'm monitoring your inventory. Ask me about sales or unlinked items." }
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && activeTab === "chat") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking, activeTab, isOpen]);

  const handleInsightClick = (insight: Insight) => {
    setActiveTab("chat");
    setInput(`Tell me more about: ${insight.title}`);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setThinking(true);

    try {
      const res = await apiPost<{ reply: string }>("/assistant/chat", {
        message: userMsg,
        history: messages,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: "I lost connection. Please try again." }]);
    } finally {
      setThinking(false);
    }
  };

  const getSeverityStyles = (s: string) => {
    switch (s) {
      case "critical": return "border-rose-200 bg-rose-50/50 dark:bg-rose-900/10 dark:border-rose-900/30";
      case "success": return "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10 dark:border-emerald-900/30";
      case "warning": return "border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-900/30";
      default: return "border-blue-200 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-900/30";
    }
  };

  const getSeverityIcon = (s: string) => {
    switch (s) {
      case "critical": return <AlertTriangle className="h-5 w-5 text-rose-500" />;
      case "warning": return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case "success": return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      default: return <Zap className="h-5 w-5 text-blue-500" />;
    }
  };

  // --- CLOSED STATE ---
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-[100] h-16 w-16 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-2xl hover:scale-105 transition-transform flex items-center justify-center group animate-in zoom-in duration-300 border-4 border-white dark:border-zinc-800"
      >
        <Sparkles className="h-7 w-7 fill-current group-hover:rotate-12 transition-transform" />
        {insights.some(i => i.severity === 'critical') && (
          <span className="absolute top-0 right-0 h-4 w-4 bg-rose-500 border-2 border-white dark:border-zinc-950 rounded-full animate-pulse" />
        )}
      </button>
    );
  }

  const isInitialState = messages.length === 1 && activeTab === "chat";
  const firstName = userName ? userName.split(' ')[0] : 'Manager';

  // --- OPEN STATE ---
  return (
    <div className="fixed bottom-6 left-6 z-[100] w-[480px] h-[720px] max-h-[85vh] flex flex-col bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-[40px] overflow-hidden animate-in slide-in-from-bottom-8 fade-in duration-300 ring-1 ring-black/5 font-sans">
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 right-0 h-96 overflow-hidden pointer-events-none z-0 opacity-40 dark:opacity-20">
         <div className="absolute top-[-100px] left-[-100px] w-[600px] h-[600px] bg-gradient-to-br from-indigo-100/50 via-purple-100/30 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Modern Header */}
      <div className="relative z-20 flex items-center justify-between p-6">
        <button 
          className="p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400" 
          onClick={() => setActiveTab(activeTab === 'chat' ? 'insights' : 'chat')}
        >
           {activeTab === 'chat' ? <Menu className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
        </button>
        
        {/* Close Button */}
        <button onClick={() => setIsOpen(false)} className="p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400">
           <X className="h-6 w-6" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative z-10 flex flex-col">
        
        {/* -------------------- CHAT TAB -------------------- */}
        {activeTab === "chat" && (
          <div className="flex-1 flex flex-col h-full">
            
            <div 
              ref={scrollRef} 
              className={cls(
                "flex-1 px-6 pb-2",
                isInitialState ? "overflow-hidden flex flex-col justify-center" : "overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent"
              )}
            >
              {isInitialState ? (
                // WELCOME SCREEN (Reference Image Style)
                <div className="flex flex-col items-center text-center -mt-10">
                   {/* Huge Custom Loader acting as the Orb */}
                   <div className="w-56 h-56 flex items-center justify-center mb-8 relative">
                      <div className="absolute inset-0 bg-yellow-400/20 blur-[60px] rounded-full animate-pulse" />
                      <div className="transform scale-[3.5] relative z-10">
                        <CustomLoader />
                      </div>
                   </div>
                   
                   <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 fill-mode-forwards max-w-[80%] mx-auto">
                     <p className="text-base font-medium text-zinc-400 dark:text-zinc-500">
                       Hi <strong>{firstName}</strong>, I'm Syni! Your personal assistant.
                     </p>
                     <h2 className="text-4xl font-extrabold text-zinc-900 dark:text-white leading-[1.1] tracking-tight">
                       How can I help<br/>you today?
                     </h2>
                   </div>
                </div>
              ) : (
                // CHAT HISTORY
                <div className="space-y-6 pt-4">
                  {messages.map((m, i) => (
                    <div key={i} className={cls("flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300", m.role === "user" ? "flex-row-reverse" : "")}>
                      {m.role === "assistant" && (
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shrink-0 shadow-sm text-white mt-1">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}
                      <div className={cls(
                        "py-3 px-5 rounded-[20px] text-[15px] leading-relaxed max-w-[85%] shadow-sm",
                        m.role === "assistant" 
                          ? "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 rounded-tl-none border border-zinc-100 dark:border-zinc-800" 
                          : "bg-black dark:bg-white text-white dark:text-black rounded-tr-none"
                      )}>
                        {m.role === "assistant" ? (
                          <ParsedMessage 
                              content={m.content} 
                              onLinkClick={(id) => onReferenceClick && onReferenceClick(id)} 
                          />
                        ) : m.content}
                      </div>
                    </div>
                  ))}
                  {thinking && (
                    <div className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                        <Bot className="h-4 w-4 text-zinc-400" />
                      </div>
                      <div className="py-3 px-5 rounded-[20px] bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-sm rounded-tl-none flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* FLOATING INPUT BAR (Matches reference) */}
            <div className="p-6 pt-2 relative z-30">
              <div className="relative group">
                <div className="relative flex items-center bg-zinc-100/80 dark:bg-zinc-900/80 backdrop-blur-md rounded-full shadow-sm px-2 py-2 transition-all border border-transparent focus-within:border-zinc-300 dark:focus-within:border-zinc-700 focus-within:bg-white dark:focus-within:bg-black focus-within:shadow-md">
                  
                  {/* Left Icon (Plus) */}
                  <button className="p-2.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                     <Plus className="h-5 w-5" />
                  </button>

                  <input 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Search or ask Syni..."
                    className="flex-1 bg-transparent border-none focus:ring-0 px-2 text-[15px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 h-10"
                    autoFocus
                  />
                  
                  {/* Right Icons (Mic / Send) */}
                  {input.trim() ? (
                    <button 
                      onClick={() => handleSend()}
                      disabled={thinking}
                      className="p-2.5 bg-black dark:bg-white text-white dark:text-black rounded-full hover:scale-105 active:scale-95 transition-all shadow-md"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="p-2.5 text-zinc-400">
                      <Mic className="h-5 w-5" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* -------------------- INSIGHTS TAB -------------------- */}
        {activeTab === "insights" && (
          <div className="flex-1 overflow-y-auto p-6 pt-0 space-y-4 animate-in fade-in slide-in-from-right-4 duration-300 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
            <div className="flex items-center justify-between mb-4 px-1">
               <h3 className="text-xl font-bold tracking-tight">Active Insights</h3>
               <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-1 rounded-full font-medium">{insights.length}</span>
            </div>
            
            {insights.length === 0 ? (
              <div className="text-center text-zinc-400 mt-20 flex flex-col items-center">
                 <CheckCircle2 className="h-10 w-10 mb-3 opacity-20" />
                 <p>All systems operational.</p>
              </div>
            ) : (
              insights.map(insight => (
                <div 
                  key={insight.id}
                  onClick={() => handleInsightClick(insight)}
                  className={cls(
                    "p-5 rounded-2xl border cursor-pointer transition-all hover:scale-[1.01] hover:shadow-lg group bg-white dark:bg-zinc-900",
                    getSeverityStyles(insight.severity)
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-white/80 dark:bg-black/40 shadow-sm border border-black/5">
                         {getSeverityIcon(insight.severity)}
                      </div>
                      <h4 className="font-bold text-sm text-foreground">{insight.title}</h4>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-black group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-black transition-all">
                       <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed pl-[44px]">
                    {insight.message}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}