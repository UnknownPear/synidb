import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MessageCircle, X, Send, ArrowLeft, Search, Edit, Trash2, Camera, Check, LogOut, UserX, UserPlus, ChevronRight, MoreHorizontal, ArrowDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// ============================================================
// CLOUDINARY CONFIGURATION
// ============================================================
const CLOUDINARY_CLOUD_NAME = "dfkynhljk"; 
const CLOUDINARY_UPLOAD_PRESET = "synergy_chat_avatars"; 

// ============================================================
// TYPES
// ============================================================
type BasicUser = { id: string; name: string };
type Participant = { id: number; name: string };
type ThreadSummary = {
  id: string;
  sender_id: number;
  body: string;
  created_at: string;
  other_id: number;
  other_name: string;
  unread_count: number;
  is_group: boolean;
  subject: string | null;
  created_by_id: number;
  avatar_url: string | null;
  participants: Participant[];
};
type Message = {
  id: string;
  sender_id: number;
  sender_name: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
};
type Employee = { id: number; name: string; role: string | null; };
type View = "inbox" | "conversation" | "new" | "group_info" | "add_members";

// ============================================================
// UTILS & HELPERS
// ============================================================
const getInitials = (name: string) => (name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

const timeAgo = (dateString: string): string => {
  if (!dateString) return "";
  const d = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const timeShort = (dateString: string): string => {
  if (!dateString) return "";
  return new Date(dateString).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const renderBody = (body: string, onSynergyClick: (code: string) => void) => {
  const SYNERGY_RE = /([A-Z0-9]{3,10}-\d{5})/gi;
  SYNERGY_RE.lastIndex = 0;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  while ((match = SYNERGY_RE.exec(body)) !== null) {
    const [full, code] = match;
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }
    const upper = code.toUpperCase();
    parts.push(
      <button 
        key={match.index} 
        onClick={() => { navigator.clipboard.writeText(upper); onSynergyClick(upper); }} 
        className="mx-1 inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 hover:text-blue-800 dark:border-blue-900 dark:bg-blue-900/30 dark:text-blue-300"
      >
        {upper}
      </button>
    );
    lastIndex = match.index + full.length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return <>{parts}</>;
};

const getGroupMeta = (messages: Message[], index: number, me: BasicUser) => {
  const m = messages[index];
  const myId = Number(me.id);
  const mine = m.sender_id === myId;
  const prev = index > 0 ? messages[index - 1] : null;
  const ts = new Date(m.created_at).getTime();
  const threshold = 5 * 60 * 1000;
  const sameAsPrev = prev && prev.sender_id === m.sender_id && ts - new Date(prev.created_at).getTime() < threshold;
  return { mine, isFirst: !sameAsPrev };
};

const getParticipantListString = (participants: Participant[], currentUser: BasicUser): string => {
  if (!participants || participants.length === 0) return "No members";
  const otherParticipants = participants.filter(p => String(p.id) !== currentUser.id).map(p => p.name.split(' ')[0]);
  const namesToShow = ["You", ...otherParticipants.slice(0, 2)];
  let displayText = namesToShow.join(", ");
  const remainingCount = otherParticipants.length - 2;
  if (remainingCount > 0) {
    displayText += ` & ${remainingCount} other${remainingCount > 1 ? 's' : ''}`;
  }
  return displayText;
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export const ChatWidget: React.FC<{ user: BasicUser }> = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("inbox");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThread, setActiveThread] = useState<ThreadSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<number[]>([]);
  const [membersToAdd, setMembersToAdd] = useState<number[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupSubjectEdit, setGroupSubjectEdit] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const API_URL = useMemo(() => ((import.meta as any).env?.VITE_API_URL || "/backend").replace(/\/+$/, ""), []);
  const unreadTotal = useMemo(() => threads.reduce((sum, t) => sum + t.unread_count, 0), [threads]);
  const isGroupAdmin = activeThread?.is_group && activeThread.created_by_id === Number(user.id);

  const filteredEmployeesForAdding = useMemo(() => {
    if (!activeThread) return [];
    const participantIds = new Set(activeThread.participants.map(p => p.id));
    return employees.filter(emp => !participantIds.has(emp.id) && emp.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [employees, activeThread, searchQuery]);
  
  // SCROLL LOGIC
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto", force: boolean = false) => {
    if (!scrollContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // If user is within 150px of the bottom, we consider them "at the bottom"
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;

    if (force || isNearBottom) {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
        }, 50);
    }
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
    setShowScrollButton(!isNearBottom);
  };

  const loadThreads = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_URL}/messages/threads/all?employee_id=${encodeURIComponent(user.id)}`);
      if (!res.ok) throw new Error("Failed to load threads");
      const json = await res.json();
      setThreads((json.threads || []).map((t: any) => ({ ...t, id: String(t.id) })));
    } catch (err) { console.error("loadThreads error:", err); }
  }, [API_URL, user.id]);

  const loadConversation = useCallback(async (thread: ThreadSummary, isPolling: boolean = false) => {
    if (!user?.id) return;
    
    // Only set these on initial user click, not during polling
    if (!isPolling) {
        setActiveThread(thread);
        setView("conversation");
        setMessages([]); // Clear previous messages to show loading or prevent flash
    }

    try {
      const url = thread.is_group ? `${API_URL}/messages/threads/${thread.id}/messages?employee_id=${user.id}` : `${API_URL}/messages/with/${thread.other_id}?employee_id=${user.id}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load messages");
      const json = await res.json();
      
      const newMessages = (json.messages || []).map((m: any) => ({ ...m, id: String(m.id) }));
      
      setMessages(prev => {
        // Prevent state update if data hasn't changed (stops unnecessary effect triggers)
        if (JSON.stringify(prev) === JSON.stringify(newMessages)) return prev;
        return newMessages;
      });

      await loadThreads();
      
      // Only force scroll on initial load (user click)
      if (!isPolling) {
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" }), 50);
      }
    } catch (err) { console.error("loadConversation error:", err); }
  }, [API_URL, user.id, loadThreads]);

  const loadEmployees = useCallback(async () => {
    if (employees.length > 0) return;
    try {
      const res = await fetch(`${API_URL}/auth/users`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      const arr = Array.isArray(data) ? data : data.users || [];
      setEmployees(arr.map((u: any) => ({ id: Number(u.id), name: u.name ?? u.full_name ?? "Unknown", role: u.role ?? u.position ?? null })));
    } catch (err) { console.error("loadEmployees error:", err); }
  }, [API_URL, employees.length]);

  const sendMessage = useCallback(async () => {
    if (!user?.id || !input.trim() || !activeThread) return;
    setSending(true);
    try {
      const url = activeThread.is_group ? `${API_URL}/messages/threads/${activeThread.id}/messages?employee_id=${user.id}` : `${API_URL}/messages`;
      const body = activeThread.is_group ? { body: input.trim() } : { sender_id: Number(user.id), recipient_id: activeThread.other_id, body: input.trim() };
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Send failed");
      const m = await res.json();
      setMessages((prev) => [...prev, { ...m, id: String(m.id), sender_name: m.sender_name ?? user.name }]);
      setInput("");
      await loadThreads();
      scrollToBottom("smooth", true); // Force scroll on send
    } catch (err) { console.error("sendMessage error:", err); }
    finally { setSending(false); }
  }, [API_URL, user, input, activeThread, loadThreads, scrollToBottom]);

  const createGroup = useCallback(async () => {
    if (selectedRecipients.length < 1 || !groupName.trim()) return;
    try {
      await fetch(`${API_URL}/messages/groups`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: groupName.trim(), member_ids: [Number(user.id), ...selectedRecipients] }) });
      await loadThreads();
      setGroupName(""); setInput(""); setSelectedRecipients([]); setView("inbox");
    } catch (err) { console.error("createGroup error:", err); }
  }, [API_URL, user.id, groupName, selectedRecipients, loadThreads]);
  
  const deleteThread = useCallback(async (threadId: string) => {
    try {
        await fetch(`${API_URL}/messages/threads/${threadId}?employee_id=${user.id}`, { method: "DELETE", credentials: "include" });
        setThreads((prev) => prev.filter((t) => t.id !== threadId));
        if (activeThread?.id === threadId) {
            setActiveThread(null); setMessages([]); setView("inbox");
        }
    } catch (err) { console.error("deleteThread error:", err); }
  }, [API_URL, user.id, activeThread]);

  const confirmDelete = (threadId: string) => { setThreadToDelete(threadId); setShowDeleteDialog(true); };
  const handleSynergyClick = useCallback((code: string) => { navigator.clipboard.writeText(code); window.dispatchEvent(new CustomEvent("synergy:focus", { detail: { synergyId: code } })); }, []);
  
  const updateGroupInfo = useCallback(async (data: { subject: string; avatar_url?: string }) => {
    if (!activeThread || !isGroupAdmin) return;
    try {
      await fetch(`${API_URL}/messages/threads/${activeThread.id}?employee_id=${user.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ subject: data.subject, avatar_url: data.avatar_url ?? activeThread.avatar_url }) });
      await loadThreads();
      setActiveThread(prev => prev ? {...prev, subject: data.subject, avatar_url: data.avatar_url ?? prev.avatar_url} : null);
    } catch (err) { console.error("updateGroupInfo error:", err); }
  }, [API_URL, user.id, activeThread, isGroupAdmin, loadThreads]);

  const leaveGroup = useCallback(async () => {
    if (!activeThread?.id) return;
    try {
      await fetch(`${API_URL}/messages/threads/${activeThread.id}/participants/me?employee_id=${user.id}`, { method: 'DELETE', credentials: 'include' });
      await loadThreads();
      setView('inbox');
      setActiveThread(null);
    } catch (err) { console.error("leaveGroup error:", err); }
  }, [API_URL, user.id, activeThread, loadThreads]);

  const removeParticipant = useCallback(async (participantId: number) => {
    if (!activeThread?.id || !isGroupAdmin) return;
    try {
      await fetch(`${API_URL}/messages/threads/${activeThread.id}/participants/${participantId}?employee_id=${user.id}`, { method: 'DELETE', credentials: 'include' });
      setActiveThread(prev => prev ? { ...prev, participants: prev.participants.filter(p => p.id !== participantId) } : null);
      await loadThreads();
    } catch (err) { console.error("removeParticipant error:", err); }
  }, [API_URL, user.id, activeThread, isGroupAdmin, loadThreads]);

  const addMembersToGroup = useCallback(async () => {
    if (!activeThread?.id || !isGroupAdmin || membersToAdd.length === 0) return;
    try {
      for (const userId of membersToAdd) {
        await fetch(`${API_URL}/messages/threads/${activeThread.id}/participants?employee_id=${user.id}`, { method: 'POST', headers: { "Content-Type": "application/json" }, credentials: 'include', body: JSON.stringify({ user_id: userId }) });
      }
      const newParticipants = employees.filter(e => membersToAdd.includes(e.id));
      setActiveThread(prev => prev ? { ...prev, participants: [...prev.participants, ...newParticipants] } : null);
      setMembersToAdd([]);
      await loadThreads();
      setView('group_info');
    } catch (err) { console.error("addMembersToGroup error:", err); }
  }, [API_URL, user.id, activeThread, isGroupAdmin, membersToAdd, employees, loadThreads]);

  const handleAvatarUpload = async (file: File): Promise<string> => {
    if (CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME") {
        console.error("Cloudinary is not configured. Please add your credentials at the top of ChatWidget.tsx");
        throw new Error("Cloudinary not configured.");
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Cloudinary upload failed.");
    }
    const result = await response.json();
    return result.secure_url;
  };

  const onFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeThread) return;
    try {
      const newAvatarUrl = await handleAvatarUpload(file);
      await updateGroupInfo({ subject: activeThread.subject || "Group", avatar_url: newAvatarUrl });
    } catch (err) {
      console.error("File upload failed:", err);
    }
    if (event.target) event.target.value = "";
  };
  
  useEffect(() => { if (open) loadThreads(); }, [open, loadThreads]);
  useEffect(() => { if (view === "new" || view === "add_members") loadEmployees(); }, [view, loadEmployees]);
  
  // Watch messages for updates
  useEffect(() => { 
      if (view === "conversation") { 
          // 2nd argument false = only scroll if user is already at bottom
          scrollToBottom("auto", false); 
      } 
  }, [messages, view, scrollToBottom]);

  // Polling Effect - Pass TRUE to loadConversation so it knows it's polling
  useEffect(() => {
    if (!user?.id) return;
    const poll = () => {
      if (view === "conversation" && activeThread) {
        loadConversation(activeThread, true).catch(() => {});
      }
      loadThreads().catch(() => {});
    };
    const intervalId = setInterval(poll, 7000);
    return () => clearInterval(intervalId);
  }, [user.id, view, activeThread, loadThreads, loadConversation]);
  
  const dmThreads = useMemo(() => threads.filter(t => !t.is_group), [threads]);
  const groupThreads = useMemo(() => threads.filter(t => t.is_group), [threads]);

  if (!open) {
    return (
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="fixed bottom-6 right-6 z-50">
        <Button onClick={() => setOpen(true)} size="icon" className="relative h-14 w-14 rounded-full bg-gradient-to-tr from-blue-600 to-blue-500 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105 transition-all duration-300">
          <MessageCircle className="h-7 w-7 text-white" />
          {unreadTotal > 0 && (<span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 ring-2 ring-white text-[10px] font-bold text-white shadow-sm">{unreadTotal > 99 ? "99+" : unreadTotal}</span>)}
        </Button>
      </motion.div>
    );
  }
  
  const conversationName = view === 'group_info' ? "Group Info" : view === 'add_members' ? "Add Members" : (activeThread?.is_group ? activeThread.subject : activeThread?.other_name);
  const title = view === "inbox" ? "Messages" : view === "new" ? "New Message" : conversationName || "Chat";

  return (
    <motion.div initial={{ opacity: 0, scale: 0.94, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }} className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-2rem)]">
      <input type="file" ref={fileInputRef} onChange={onFileSelected} accept="image/*" style={{ display: 'none' }} />
      <div className="flex h-[650px] flex-col overflow-hidden rounded-[24px] bg-white border border-gray-200 shadow-2xl dark:bg-zinc-950 dark:border-zinc-800">
        {/* HEADER */}
        <header className="relative z-10 flex h-16 shrink-0 items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md px-4 dark:border-zinc-800 dark:bg-zinc-900/80">
          <div className="flex items-center gap-2 min-w-0">
            {view !== "inbox" && (
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800" onClick={() => { view === "group_info" ? setView("conversation") : view === "add_members" ? setView("group_info") : (setView("inbox"), setActiveThread(null)); }}>
                <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </Button>
            )}
            <div className="min-w-0 flex-1">
              <div className={cn("flex items-center gap-1", activeThread?.is_group && view === 'conversation' && "cursor-pointer group select-none")} onClick={() => { if (activeThread?.is_group && view === 'conversation') { setGroupSubjectEdit(activeThread.subject || ""); setView("group_info"); } }}>
                <h1 className="text-[17px] font-semibold tracking-tight text-gray-900 dark:text-white truncate">{title}</h1>
                {view === 'conversation' && activeThread?.is_group && <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 transition-colors" />}
              </div>
              {view === 'conversation' && activeThread?.is_group && (<p className="text-xs text-gray-500 dark:text-gray-400 truncate">{getParticipantListString(activeThread.participants, user)}</p>)}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {view === "inbox" && (
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20" onClick={() => setView("new")}> 
                <Edit className="h-5 w-5" /> 
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white" onClick={() => setOpen(false)}> 
              <X className="h-5 w-5" /> 
            </Button>
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex flex-1 flex-col overflow-hidden bg-gray-50/50 dark:bg-zinc-950 relative">
          <AnimatePresence mode="wait">
            
            {/* INBOX VIEW */}
            {view === 'inbox' && (
              <motion.div key="inbox" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex h-full flex-col">
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-6">
                    {dmThreads.length > 0 && (
                      <div className="space-y-1">
                        <div className="px-3 text-[11px] font-bold tracking-wider text-gray-400 uppercase">Direct Messages</div>
                        {dmThreads.map((t) => (
                          <div key={t.id} className="group relative flex items-center gap-3 rounded-xl p-2.5 hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-gray-200 transition-all dark:hover:bg-zinc-900 dark:hover:ring-zinc-800 cursor-pointer" onClick={() => loadConversation(t)}>
                            <Avatar className="h-12 w-12 border border-gray-100 shadow-sm">
                                {t.avatar_url ? <AvatarImage src={t.avatar_url} className="object-cover" /> : <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-semibold">{getInitials(t.other_name)}</AvatarFallback>}
                            </Avatar>
                            <div className="flex-1 min-w-0 py-0.5">
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="font-semibold text-gray-900 dark:text-white truncate text-[15px]">{t.other_name}</span>
                                <span className="text-[11px] text-gray-400 shrink-0 ml-2 font-medium">{timeAgo(t.created_at)}</span>
                              </div>
                              <p className={cn("text-sm truncate pr-6", t.unread_count > 0 ? "text-gray-900 font-medium dark:text-white" : "text-gray-500 dark:text-gray-400")}>{t.body}</p>
                            </div>
                            {t.unread_count > 0 && (<span className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 min-w-[1.25rem] px-1 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white shadow-sm">{t.unread_count}</span>)}
                            <button onClick={(e) => { e.stopPropagation(); confirmDelete(t.id); }} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 hover:bg-red-50 p-2 rounded-full text-gray-400 hover:text-red-600 transition-all z-10" title="Delete chat">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {groupThreads.length > 0 && (
                      <div className="space-y-1">
                        <div className="px-3 text-[11px] font-bold tracking-wider text-gray-400 uppercase">Groups</div>
                        {groupThreads.map((t) => {
                          const lastMessageSender = t.participants.find(p => p.id === t.sender_id);
                          const lastMessagePrefix = `${lastMessageSender?.name === user.name ? "You" : lastMessageSender?.name?.split(' ')[0]}: `;
                          return (
                            <div key={t.id} className="group relative flex items-center gap-3 rounded-xl p-2.5 hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-gray-200 transition-all dark:hover:bg-zinc-900 dark:hover:ring-zinc-800 cursor-pointer" onClick={() => loadConversation(t)}>
                              <Avatar className="h-12 w-12 border border-gray-100 shadow-sm">
                                {t.avatar_url ? <AvatarImage src={t.avatar_url} className="object-cover" /> : <AvatarFallback className="bg-gradient-to-br from-blue-500 to-cyan-500 text-white font-semibold">{getInitials(t.subject || "G")}</AvatarFallback>}
                              </Avatar>
                              <div className="flex-1 min-w-0 py-0.5">
                                <div className="flex justify-between items-center mb-0.5">
                                  <span className="font-semibold text-gray-900 dark:text-white truncate text-[15px]">{t.subject}</span>
                                  <span className="text-[11px] text-gray-400 shrink-0 ml-2 font-medium">{timeAgo(t.created_at)}</span>
                                </div>
                                <p className={cn("text-sm truncate pr-6", t.unread_count > 0 ? "text-gray-900 font-medium dark:text-white" : "text-gray-500 dark:text-gray-400")}>
                                  <span className="font-medium text-gray-700 dark:text-gray-300">{lastMessagePrefix}</span>
                                  {t.body}
                                </p>
                              </div>
                              {t.unread_count > 0 && (<span className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 min-w-[1.25rem] px-1 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white shadow-sm">{t.unread_count}</span>)}
                              {t.created_by_id === Number(user.id) && (
                                <button onClick={(e) => { e.stopPropagation(); confirmDelete(t.id); }} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 hover:bg-red-50 p-2 rounded-full text-gray-400 hover:text-red-600 transition-all z-10" title="Delete group">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    
                    {dmThreads.length === 0 && groupThreads.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
                        <MessageCircle className="h-12 w-12 text-gray-300 mb-2" />
                        <p className="text-sm font-medium text-gray-500">No messages yet</p>
                        <Button variant="link" onClick={() => setView('new')} className="text-blue-600">Start a new chat</Button>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </motion.div>
            )}

            {/* CONVERSATION VIEW */}
            {view === 'conversation' && (
              <motion.div key="conversation" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex h-full flex-col bg-white dark:bg-zinc-950 relative">
                
                {/* MESSAGES LIST */}
                <div 
                    className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-black/20" 
                    onScroll={handleScroll} 
                    ref={scrollContainerRef}
                >
                  <div className="px-4 pt-4 pb-4">
                    {messages.map((m, i) => {
                      const { mine, isFirst } = getGroupMeta(messages, i, user);
                      return (
                        <div key={m.id} className={cn("flex flex-col mb-1", mine ? "items-end" : "items-start", isFirst ? "mt-4" : "")}>
                          <div className={cn("flex items-end gap-2 max-w-[85%]", mine ? "flex-row-reverse" : "flex-row")}>
                            {!mine && activeThread?.is_group && (
                                <div className="shrink-0 mb-1">
                                    {isFirst ? (
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback className="text-[10px] bg-gray-200">{getInitials(m.sender_name || "?")}</AvatarFallback>
                                        </Avatar>
                                    ) : <div className="w-8" />}
                                </div>
                            )}
                            <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                              {!mine && activeThread?.is_group && isFirst && (<span className="text-[10px] font-semibold text-gray-500 ml-1 mb-1">{m.sender_name}</span>)}
                              <div className={cn(
                                "relative rounded-2xl px-4 py-2 text-[14px] shadow-sm", 
                                mine 
                                  ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-sm" 
                                  : "bg-white border border-gray-100 text-gray-800 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 rounded-bl-sm"
                              )}>
                                <div className="break-words leading-relaxed tracking-normal">{renderBody(m.body, handleSynergyClick)}</div>
                              </div>
                              <div className={cn("mt-1 text-[9px] font-medium text-gray-400 select-none", mine ? "text-right mr-1" : "text-left ml-1")}>
                                {timeShort(m.created_at)}{mine && m.read_at && <span className="ml-1 text-blue-400">Read</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
                
                {/* JUMP TO BOTTOM BUTTON */}
                <AnimatePresence>
                    {showScrollButton && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-20 right-4 z-20"
                        >
                            <Button 
                                size="icon" 
                                className="rounded-full bg-white shadow-lg text-blue-600 hover:bg-blue-50 border border-gray-200 dark:bg-zinc-800 dark:border-zinc-700 dark:text-blue-400 w-10 h-10"
                                onClick={() => scrollToBottom("smooth", true)}
                            >
                                <ArrowDown className="h-5 w-5" />
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="p-3 bg-white border-t border-gray-100 dark:bg-zinc-900 dark:border-zinc-800">
                  <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="relative flex items-center">
                    <Input 
                      value={input} 
                      onChange={(e) => setInput(e.target.value)} 
                      placeholder="Type a message..." 
                      className="h-11 rounded-full bg-gray-100 border-0 pl-4 pr-12 text-sm focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:bg-white transition-all dark:bg-zinc-800 dark:focus-visible:bg-zinc-900"
                    />
                    <Button 
                      type="submit" 
                      size="icon" 
                      disabled={!input.trim() || sending} 
                      className={cn(
                        "absolute right-1.5 h-8 w-8 rounded-full transition-all",
                        input.trim() ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md" : "bg-transparent text-gray-400 hover:bg-gray-200"
                      )}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </motion.div>
            )}

            {/* NEW MESSAGE VIEW */}
            {view === 'new' && (
              <motion.div key="new" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="flex h-full flex-col bg-white dark:bg-zinc-950">
                <div className="p-4 border-b border-gray-100 dark:border-zinc-800 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search people..." autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-10 rounded-xl bg-gray-50 border-gray-200 dark:bg-zinc-900 dark:border-zinc-800"/>
                  </div>
                  {selectedRecipients.length > 0 && (
                     <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                       {selectedRecipients.map(id => {
                         const u = employees.find(e => e.id === id);
                         if(!u) return null;
                         return (
                           <div key={id} className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap dark:bg-blue-900/30 dark:text-blue-300">
                             {u.name.split(' ')[0]}
                             <X className="h-3 w-3 cursor-pointer hover:text-blue-900" onClick={() => setSelectedRecipients(p => p.filter(x => x !== id))} />
                           </div>
                         )
                       })}
                     </div>
                  )}
                  {selectedRecipients.length > 1 && (
                    <Input placeholder="Group Name (Required)" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="h-10 rounded-xl bg-gray-50 border-gray-200 dark:bg-zinc-900 dark:border-zinc-800"/>
                  )}
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2">
                    {employees.filter(emp => emp.name.toLowerCase().includes(searchQuery.toLowerCase()) && emp.id !== Number(user.id)).map((emp) => {
                      const selected = selectedRecipients.includes(emp.id);
                      return (
                        <div key={emp.id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-gray-50 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
                          onClick={() => {
                             const newThread: ThreadSummary = { id: `dm-${emp.id}`, other_id: emp.id, other_name: emp.name, is_group: false, sender_id: 0, body: '', created_at: '', unread_count: 0, subject: null, participants: [], avatar_url: null, created_by_id: 0 }
                             if (selectedRecipients.length === 0) {
                               loadConversation(newThread);
                             } else {
                               setSelectedRecipients((prev) => prev.includes(emp.id) ? prev.filter((x) => x !== emp.id) : [...prev, emp.id]);
                             }
                          }}
                        >
                          <Avatar className="h-10 w-10">
                              <AvatarFallback>{getInitials(emp.name)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-semibold text-sm text-gray-900 dark:text-white">{emp.name}</p>
                            {emp.role && (<p className="text-xs text-gray-500 dark:text-gray-400">{emp.role}</p>)}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedRecipients((prev) => prev.includes(emp.id) ? prev.filter((x) => x !== emp.id) : [...prev, emp.id]); }}
                            className={cn("flex h-6 w-6 items-center justify-center rounded-full border transition-all", selected ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-gray-300 hover:border-blue-400 hover:text-blue-400 dark:border-zinc-600")}
                          >
                            {selected ? <Check className="h-3 w-3" /> : <span className="mb-0.5 text-lg leading-none">+</span>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
                {selectedRecipients.length > 1 && (
                  <div className="p-4 bg-gray-50 border-t border-gray-100 dark:bg-zinc-900 dark:border-zinc-800">
                    <div className="flex justify-end gap-3">
                      <Button variant="ghost" onClick={() => { setSelectedRecipients([]); setGroupName(""); }}>Cancel</Button>
                      <Button onClick={createGroup} disabled={!groupName.trim()} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6">
                        Create Group
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* GROUP INFO VIEW */}
            {view === "group_info" && activeThread && (
              <motion.div key="group_info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full flex-col bg-gray-50/50 dark:bg-black">
                <ScrollArea className="flex-1">
                  <div className="flex flex-col items-center pt-8 pb-6 bg-white border-b border-gray-100 dark:bg-zinc-900 dark:border-zinc-800 mb-2">
                    <div className="relative group cursor-pointer" onClick={() => isGroupAdmin && fileInputRef.current?.click()}>
                      <Avatar className="h-24 w-24 border-4 border-white shadow-lg">
                        {activeThread.avatar_url ? <AvatarImage src={activeThread.avatar_url} className="object-cover" /> : <AvatarFallback className="text-2xl bg-gray-100">{getInitials(activeThread.subject || "G")}</AvatarFallback>}
                      </Avatar>
                      {isGroupAdmin && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="h-6 w-6 text-white" />
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-4 px-8 w-full text-center">
                      {isGroupAdmin ? (
                        <div className="flex items-center justify-center gap-2">
                          <Input value={groupSubjectEdit} onChange={(e) => setGroupSubjectEdit(e.target.value)} className="text-center text-lg font-bold bg-transparent border-transparent hover:border-gray-200 focus:border-blue-500 focus:bg-white transition-all h-9 p-0 w-full max-w-[200px]" />
                          {groupSubjectEdit !== activeThread.subject && <Button size="sm" variant="ghost" onClick={() => updateGroupInfo({ subject: groupSubjectEdit })}><Check className="h-4 w-4 text-green-600" /></Button>}
                        </div>
                      ) : (
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{activeThread.subject}</h2>
                      )}
                      <p className="text-sm text-gray-500 mt-1">{activeThread.participants.length} Members</p>
                    </div>
                  </div>

                  <div className="px-4 py-2">
                    <div className="flex items-center justify-between mb-2 px-1">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Participants</h3>
                        {isGroupAdmin && (<button onClick={() => setView('add_members')} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"><UserPlus className="h-3 w-3" /> Add</button>)}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
                      {activeThread.participants.map((p, idx) => (
                        <div key={p.id} className={cn("flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors", idx !== activeThread.participants.length - 1 && "border-b border-gray-100 dark:border-zinc-800")}>
                          <Avatar className="h-9 w-9">
                            <AvatarFallback>{getInitials(p.name)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{p.name}</p>
                            {activeThread.created_by_id === p.id && <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Admin</p>}
                          </div>
                          {isGroupAdmin && p.id !== Number(user.id) && (
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeParticipant(p.id)}><UserX className="h-4 w-4" /></Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="px-6 mt-6 space-y-3 pb-8">
                     <Button variant="outline" className="w-full text-red-600 border-red-100 hover:bg-red-50 hover:text-red-700 dark:border-red-900/30 dark:bg-red-900/10" onClick={leaveGroup}>
                        <LogOut className="h-4 w-4 mr-2" /> Leave Group
                     </Button>
                     {isGroupAdmin && (
                        <Button variant="ghost" className="w-full text-gray-400 hover:text-red-600 hover:bg-transparent" onClick={() => confirmDelete(activeThread.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete Group
                        </Button>
                     )}
                  </div>
                </ScrollArea>
              </motion.div>
            )}

            {/* ADD MEMBERS VIEW */}
            {view === "add_members" && activeThread && (
              <motion.div key="add_members" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full flex-col bg-white dark:bg-zinc-950">
                <div className="border-b border-gray-100 dark:border-zinc-800 p-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search people..." autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-10 rounded-xl bg-gray-50 border-gray-200 dark:bg-zinc-900 dark:border-zinc-800" />
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2">
                    {filteredEmployeesForAdding.length === 0 ? (
                        <p className="text-center text-sm text-gray-400 mt-8">No people found</p>
                    ) : filteredEmployeesForAdding.map((emp) => {
                      const selected = membersToAdd.includes(emp.id);
                      return (
                        <div key={emp.id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-gray-50 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
                          onClick={() => { setMembersToAdd(prev => prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id]); }}
                        >
                          <Avatar className="h-10 w-10">
                              <AvatarFallback>{getInitials(emp.name)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-semibold text-sm text-gray-900 dark:text-white">{emp.name}</p>
                            {emp.role && (<p className="text-xs text-gray-500 dark:text-gray-400">{emp.role}</p>)}
                          </div>
                          <div className={cn("flex h-6 w-6 items-center justify-center rounded-full border transition-all", selected ? "border-blue-600 bg-blue-600" : "border-gray-300 dark:border-zinc-600")}>
                            {selected && <Check className="h-3 w-3 text-white" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
                <div className="p-4 border-t border-gray-100 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900">
                  <Button onClick={addMembersToGroup} disabled={membersToAdd.length === 0} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-full">
                    {`Add ${membersToAdd.length} Member${membersToAdd.length === 1 ? '' : 's'}`}
                  </Button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* DELETE CONFIRMATION */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this conversation? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (threadToDelete) deleteThread(threadToDelete); setShowDeleteDialog(false); setThreadToDelete(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}