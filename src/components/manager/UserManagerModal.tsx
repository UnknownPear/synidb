// src/components/manager/UserManagerModal.tsx

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { 
  Lock, X, CheckCircle2, Search, ChevronRight,
  ShieldCheck, Users, UserPlus, Plus, Trash2,
  User, UserCog, Feather, ShieldAlert, Save, Loader2, Key, PenTool, ShieldBan
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const RAW_API = (import.meta as any).env?.VITE_API_URL as string | undefined;
const API_BASE = (() => {
  if (RAW_API && /^https?:\/\//i.test(RAW_API)) return RAW_API.replace(/\/+$/, "");
  const p = RAW_API && RAW_API.trim() ? RAW_API : "/backend";
  return (p.startsWith("/") ? p : `/${p}`).replace(/\/+$/, "");
})();
const join = (b: string, p: string) => `${b}${p.startsWith("/") ? p : `/${p}`}`;

// Snyk Fix: Helper to sanitize URLs (prevent javascript: etc)
function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (["http:", "https:"].includes(parsed.protocol)) {
      return url;
    }
  } catch (e) {
    // If invalid URL, ignore or check relative paths if needed
  }
  return undefined;
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(join(API_BASE, path), { headers: { "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const r = await fetch(join(API_BASE, path), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiPut<T>(path: string, body: any, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(join(API_BASE, path), {
    method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiPatch<T>(path: string, body: any, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(join(API_BASE, path), {
    method: "PATCH", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiDeleteWithBody(path: string, body: any) {
  const r = await fetch(join(API_BASE, path), {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json().catch(() => ({}));
}

type AppUser = {
  id: number | string;
  name: string;
  role: string; // Legacy
  roles?: string[]; // New Multi-Role
  avatar_url?: string | null;
  has_password?: boolean;
};

type Props = { open: boolean; managerId: string | number | null; onClose: () => void; };

const ROLES = [
  { label: "Tester", icon: Feather, color: "text-indigo-500" },
  { label: "Poster", icon: PenTool, color: "text-emerald-500" },
  { label: "Manager", icon: UserCog, color: "text-sky-500" },
  { label: "Admin", icon: ShieldCheck, color: "text-rose-500" },
];

export default function UserManagerModal({ open, managerId, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("All");

  // Form State
  const [formName, setFormName] = useState("");
  const [formRoles, setFormRoles] = useState<string[]>(["Tester"]); // Multi-Select
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [deleteStep, setDeleteStep] = useState<"none" | "confirm" | "verify" | "done">("none");
  const [managerPassword, setManagerPassword] = useState("");
  const [confirmCheck, setConfirmCheck] = useState(false);
  const [deletedUserName, setDeletedUserName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sectionBusy, setSectionBusy] = useState<"profile" | "password" | "delete" | null>(null);

  useEffect(() => {
    if (open) {
      const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
          const allUsers = await apiGet<AppUser[]>("/auth/users?active=true");
          setUsers(allUsers || []);
        } catch (err) { setError("Failed to load user list."); } finally { setLoadingUsers(false); }
      };
      fetchUsers();
    }
  }, [open, refreshKey]);

  const handleClose = () => { resetForm(); setMode("idle"); setSelectedRoleFilter("All"); setSearchTerm(""); onClose(); };

  const resetForm = () => {
    setFormName("");
    setFormRoles(["Tester"]);
    setPassword("");
    setConfirmPassword("");
    setManagerPassword("");
    setDeleteStep("none");
    setConfirmCheck(false);
    setError(null);
    setSuccess(null);
    setBusy(false);
    setSectionBusy(null);
  };

  const getInitials = (name: string) => (name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const isSelf = useMemo(() => {
    if (!selectedUser || !managerId) return false;
    return String(selectedUser.id) === String(managerId);
  }, [selectedUser, managerId]);

  const toggleRole = (roleLabel: string) => {
    if (isSelf) return; // Cannot edit self
    setFormRoles(prev => {
      if (prev.includes(roleLabel)) {
        if (prev.length === 1) return prev; // Must have at least 1 role
        return prev.filter(r => r !== roleLabel);
      } else {
        return [...prev, roleLabel];
      }
    });
  };

  const handleCreateMode = () => { setMode("create"); setSelectedUser(null); resetForm(); };

  const handleSelectUser = (user: AppUser) => {
    setMode("edit");
    setSelectedUser(user);
    setFormName(user.name);
    // If 'roles' exists, use it; otherwise fallback to 'role'
    setFormRoles(user.roles && user.roles.length > 0 ? user.roles : [user.role]);
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(null);
    setDeleteStep("none");
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerId) return;
    setError(null);
    if (!formName.trim()) { setError("Name required."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    const isPrivileged = formRoles.some(r => ["Manager", "Admin"].includes(r));
    if (isPrivileged && !password) { setError("Managers/Admins must have a password."); return; }

    setBusy(true);
    try {
        const newUser = await apiPost<AppUser>("/auth/users", {
          name: formName.trim(),
          roles: formRoles, // Send array
          active: true,
          password: password || undefined
        });
        setSuccess(`User "${formName}" created.`);
        setFormName(""); setPassword(""); setConfirmPassword(""); setRefreshKey(k => k + 1);
        setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) { setError(err?.message || "Create failed."); } finally { setBusy(false); }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !managerId) return;
    setSectionBusy("profile"); setError(null); setSuccess(null);
    try {
        await apiPatch(`/admin/users/${selectedUser.id}`, {
            name: formName.trim(),
            roles: formRoles // Send array
        }, { 'X-User-ID': String(managerId) });
        setSuccess("Profile updated.");
        setRefreshKey(k => k + 1);
        setSelectedUser(prev => prev ? ({...prev, name: formName, roles: formRoles, role: formRoles[0]}) : null);
    } catch (err: any) { setError(err.message || "Update failed."); } finally { setSectionBusy(null); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !managerId) return;
    if (!password) { setError("Password empty."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setSectionBusy("password"); setError(null); setSuccess(null);
    try {
        await apiPut(`/admin/users/${selectedUser.id}/reset-password`, { password }, { 'X-User-ID': String(managerId) });
        setSuccess("Password updated."); setPassword(""); setConfirmPassword("");
    } catch (err: any) { setError(err.message || "Reset failed."); } finally { setSectionBusy(null); }
  };

 const confirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !managerId || !managerPassword) { 
      if(!managerPassword) setError("Password required."); 
      return; 
    }
    
    if (String(selectedUser.id) === String(managerId)) {
      setError("You cannot delete your own account.");
      return;
    }

    setSectionBusy("delete"); 
    setError(null);
    try {
        const nameToDelete = selectedUser.name;
        await apiDeleteWithBody(`/admin/users/${selectedUser.id}`, { manager_id: Number(managerId), manager_password: managerPassword });
        setDeletedUserName(nameToDelete); 
        setDeleteStep("done"); 
        setRefreshKey(k => k + 1);
    } catch (err: any) { 
        setError(err.detail || "Deletion failed. Check password."); 
    } finally { 
        setSectionBusy(null); 
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase());
      // Check if user has the selected role in their list
      const uRoles = u.roles || [u.role];
      const matchesRole = selectedRoleFilter === "All" || uRoles.includes(selectedRoleFilter);
      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, selectedRoleFilter]);

  const rolesList = ["All", ...ROLES.map(r => r.label)];

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-5xl h-[700px] flex bg-card dark:bg-slate-900 rounded-2xl shadow-2xl border dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* --- LEFT: DIRECTORY --- */}
        <div className="w-80 md:w-96 border-r dark:border-slate-800 bg-muted/10 dark:bg-slate-950/50 flex flex-col flex-shrink-0">
          <div className="p-4 border-b dark:border-slate-800 bg-background dark:bg-slate-900/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <Users className="h-5 w-5" /> <span>User Directory</span>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCreateMode}><Plus className="h-5 w-5 text-primary" /></Button>
            </div>
            
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search users..." className="pl-9 bg-background dark:bg-slate-950" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mask-linear-fade">
              {rolesList.map(role => (
                <button key={role} onClick={() => setSelectedRoleFilter(role)} className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors border ${selectedRoleFilter === role ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-transparent hover:bg-muted"}`}>
                  {role}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingUsers ? <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">Loading...</div> : 
             filteredUsers.length === 0 ? <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/60 text-center px-4"><Users className="h-10 w-10 mb-2 opacity-20" /><p className="text-sm">No users found.</p></div> : 
             filteredUsers.map(user => {
               const uRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
               // Snyk Fix: use safeUrl
               const avatarSrc = safeUrl(user.avatar_url);
               return (
                <button key={user.id} onClick={() => handleSelectUser(user)} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${selectedUser?.id === user.id && mode === "edit" ? "bg-primary/10 border-primary/30 dark:bg-primary/20 shadow-sm relative z-10" : "bg-transparent border-transparent hover:bg-muted/80 dark:hover:bg-slate-800"}`}>
                  <Avatar className={`h-10 w-10 border ${selectedUser?.id === user.id && mode === "edit" ? "ring-2 ring-primary/20" : ""}`}>
                    {avatarSrc ? <img src={avatarSrc} className="object-cover" /> : <AvatarFallback className="bg-muted text-muted-foreground">{getInitials(user.name)}</AvatarFallback>}
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${selectedUser?.id === user.id && mode === "edit" ? "text-primary" : "text-foreground"}`}>{user.name}</div>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {uRoles.map(r => (
                        <Badge key={r} variant="outline" className="text-[9px] px-1 py-0 h-3.5 font-normal text-muted-foreground border-muted-foreground/20 bg-background/50">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {selectedUser?.id === user.id && mode === "edit" && <ChevronRight className="h-4 w-4 text-primary" />}
                </button>
               )
             })
            }
          </div>
        </div>

        {/* --- RIGHT: DETAIL / FORM --- */}
        <div className="flex-1 bg-background dark:bg-slate-900 relative flex flex-col">
          <Button variant="ghost" size="icon" onClick={handleClose} className="absolute top-3 right-3 z-20 hover:bg-muted rounded-full">
            <X className="h-5 w-5 text-muted-foreground" />
          </Button>

          {mode === "idle" && (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/40 p-8 text-center">
              <div className="bg-muted/20 dark:bg-slate-800 p-6 rounded-full mb-4"><UserCog className="h-12 w-12" /></div>
              <h3 className="text-lg font-semibold text-foreground/80">User Management</h3>
              <p className="max-w-xs mx-auto text-sm mt-2">Select a user or create a new one.</p>
            </div>
          )}

          {mode === "create" && (
            <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300 p-8 max-w-lg mx-auto w-full justify-center">
                 <div className="flex flex-col items-center mb-8">
                    <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-4 border-2 border-dashed border-primary/30"><UserPlus className="h-10 w-10 text-primary" /></div>
                    <h2 className="text-2xl font-bold">Create New User</h2>
                 </div>
                 <form onSubmit={handleCreateUser} className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">Full Name</label>
                      <div className="relative">
                         <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                         <Input value={formName} onChange={e => setFormName(e.target.value)} className="pl-10 dark:bg-slate-950" placeholder="e.g. Jane Doe" autoFocus />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">Roles (Multi-Select)</label>
                      <div className="grid grid-cols-4 gap-2">
                         {ROLES.map(r => {
                           const isSelected = formRoles.includes(r.label);
                           return (
                             <button type="button" key={r.label} onClick={() => toggleRole(r.label)} className={`flex flex-col items-center justify-center gap-1.5 text-[11px] py-3 rounded-lg border transition-all ${isSelected ? 'bg-primary/10 border-primary text-primary ring-1 ring-primary/50' : 'bg-background dark:bg-slate-950 border-input hover:bg-muted'}`}>
                               <r.icon className={`h-5 w-5 ${isSelected ? 'text-primary' : r.color}`} />
                               <span className="font-medium">{r.label}</span>
                             </button>
                           )
                         })}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1 flex justify-between">
                         <span>Password</span>
                         <span className="text-[10px] font-normal opacity-70">{formRoles.some(r => ["Manager", "Admin"].includes(r)) ? "(Required)" : "(Optional)"}</span>
                      </label>
                      <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="pl-10 dark:bg-slate-950" placeholder="••••••••" /></div>
                    </div>
                    <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="pl-10 dark:bg-slate-950" placeholder="Confirm Password" /></div>
                    {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md border border-destructive/20">{error}</div>}
                    {success && <div className="text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-md border border-emerald-100 dark:border-emerald-900">{success}</div>}
                    <Button type="submit" disabled={busy} className="w-full h-11 text-base shadow-lg shadow-primary/20">{busy ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : "Create User"}</Button>
                 </form>
            </div>
          )}

          {mode === "edit" && selectedUser && (
            <div className="flex-1 flex flex-col h-full">
               {deleteStep === "done" ? (
                   <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in zoom-in-95">
                       <div className="h-24 w-24 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-6"><CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" /></div>
                       <h2 className="text-2xl font-bold mb-2">User Deleted</h2>
                       <p className="text-muted-foreground mb-8"><strong>{deletedUserName}</strong> has been permanently removed.</p>
                       <Button onClick={() => { setDeleteStep("none"); setMode("idle"); setSelectedUser(null); }}>Done</Button>
                   </div>
               ) : deleteStep === "none" ? (
                  <>
                    <div className="flex items-center justify-between border-b dark:border-slate-800 p-6 bg-background dark:bg-slate-900 shrink-0">
                         <div className="flex items-center gap-4">
                             {/* Snyk Fix: use safeUrl */}
                             <Avatar className="h-14 w-14 border-2 border-muted/50">
                                {safeUrl(selectedUser.avatar_url) ? <img src={safeUrl(selectedUser.avatar_url)} className="object-cover" /> : <AvatarFallback className="bg-primary/5 text-primary text-xl">{getInitials(selectedUser.name)}</AvatarFallback>}
                             </Avatar>
                             <div>
                                <h2 className="text-xl font-bold leading-none mb-1">{selectedUser.name}</h2>
                                <div className="flex items-center gap-2">
                                   {selectedUser.roles?.map(r => <Badge key={r} variant="secondary" className="text-[10px] h-5">{r}</Badge>) || <Badge variant="secondary" className="text-[10px] h-5">{selectedUser.role}</Badge>}
                                   {isSelf && <Badge variant="outline" className="text-[10px] h-5 border-primary/50 text-primary">You</Badge>}
                                </div>
                             </div>
                         </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-5">
                        {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md border border-destructive/20">{error}</div>}
                        {success && <div className="text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-md border border-emerald-100 dark:border-emerald-900">{success}</div>}

                        {/* PROFILE CARD */}
                        <form onSubmit={handleUpdateProfile} className="rounded-xl border dark:border-slate-800 bg-muted/20 p-5 space-y-4">
                             <div className="flex items-center justify-between border-b dark:border-slate-800 pb-3">
                                 <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-2"><UserCog className="h-3.5 w-3.5"/> Account Details</label>
                                 {sectionBusy === "profile" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground"/>}
                             </div>
                             
                             <div className="space-y-4 pt-1">
                                <div className="grid grid-cols-12 gap-4 items-center">
                                   <label className="col-span-3 text-xs font-medium text-muted-foreground">Display Name</label>
                                   <div className="col-span-9 relative">
                                      <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                      <Input value={formName} onChange={e => setFormName(e.target.value)} className="pl-8 bg-white dark:bg-slate-950 h-9 text-sm" />
                                   </div>
                                </div>

                                <div className="grid grid-cols-12 gap-4 items-start">
                                   <label className="col-span-3 text-xs font-medium text-muted-foreground pt-2">
                                      Roles
                                      {isSelf && <span className="block text-[10px] text-amber-500 font-normal mt-0.5">(Cannot change own)</span>}
                                   </label>
                                   <div className="col-span-9 grid grid-cols-4 gap-2">
                                      {ROLES.map(r => {
                                          const isSelected = formRoles.includes(r.label);
                                          return (
                                              <button type="button" key={r.label} disabled={isSelf} onClick={() => toggleRole(r.label)} className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg border transition-all ${isSelf ? 'opacity-50 cursor-not-allowed grayscale' : ''} ${isSelected ? 'bg-background dark:bg-slate-950 border-primary text-primary ring-1 ring-primary/30' : 'bg-white dark:bg-slate-950 border-transparent hover:bg-muted hover:border-muted-foreground/20'}`}>
                                                  <r.icon className={`h-4 w-4 ${isSelected ? 'text-primary' : r.color}`} />
                                                  <span className="text-[10px] font-medium">{r.label}</span>
                                              </button>
                                          )
                                      })}
                                   </div>
                                </div>
                             </div>
                             <div className="flex justify-end pt-2">
                                 <Button type="submit" size="sm" variant="outline" disabled={sectionBusy === "profile"} className="h-8 text-xs gap-2"><Save className="h-3 w-3" /> Save Changes</Button>
                             </div>
                        </form>

                        {/* SECURITY CARD */}
                        <form onSubmit={handleResetPassword} className="rounded-xl border dark:border-slate-800 bg-muted/20 p-5 space-y-4">
                             <div className="flex items-center justify-between border-b dark:border-slate-800 pb-3">
                                 <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5"/> Password Reset</label>
                                 {sectionBusy === "password" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground"/>}
                             </div>
                             <div className="grid grid-cols-2 gap-4 pt-1">
                                 <div className="relative"><Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="pl-8 bg-white dark:bg-slate-950 h-9 text-sm" placeholder="New Password" /></div>
                                 <div className="relative"><Key className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="pl-8 bg-white dark:bg-slate-950 h-9 text-sm" placeholder="Confirm" /></div>
                             </div>
                             <div className="flex justify-end pt-2"><Button type="submit" size="sm" variant="outline" disabled={sectionBusy === "password"} className="h-8 text-xs gap-2"><CheckCircle2 className="h-3 w-3" /> Update Password</Button></div>
                        </form>
                    </div>
                    
                    <div className="p-4 border-t dark:border-slate-800 bg-muted/10 mt-auto">
                         {isSelf ? (
                             <div className="w-full flex items-center justify-center gap-2 p-2 rounded border border-dashed border-muted-foreground/30 text-muted-foreground text-sm"><ShieldBan className="h-4 w-4" /><span>You cannot delete your own account.</span></div>
                         ) : (
                             <Button type="button" variant="ghost" onClick={() => { setError(null); setDeleteStep("confirm"); }} className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 h-9 text-sm gap-2"><Trash2 className="h-4 w-4" /> Delete User Account</Button>
                         )}
                    </div>
                  </>
               ) : (
                 <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-sm mx-auto w-full text-center h-full">
                     <div className="h-20 w-20 bg-destructive/10 rounded-full flex items-center justify-center mb-4 border-2 border-dashed border-destructive/30"><ShieldAlert className="h-10 w-10 text-destructive" /></div>
                     <h3 className="text-xl font-bold text-destructive mb-2">Delete Account?</h3>
                     <p className="text-sm text-muted-foreground mb-6">Permanently delete <strong>{selectedUser.name}</strong>? This cannot be undone.</p>
                     {deleteStep === "confirm" && (
                        <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-4">
                           <div className="flex items-start gap-3 text-left p-3 bg-muted/30 rounded-lg border">
                              <input type="checkbox" checked={confirmCheck} onChange={e => setConfirmCheck(e.target.checked)} className="mt-1 h-4 w-4 rounded" />
                              <label className="text-sm cursor-pointer" onClick={() => setConfirmCheck(!confirmCheck)}>I understand this action is permanent.</label>
                           </div>
                           <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setDeleteStep("none")}>Cancel</Button><Button variant="destructive" className="flex-1" disabled={!confirmCheck} onClick={() => setDeleteStep("verify")}>Next</Button></div>
                        </div>
                     )}
                     {deleteStep === "verify" && (
                        <form onSubmit={confirmDelete} className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-4">
                           <div className="text-left"><label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">Manager Password Required</label><Input type="password" value={managerPassword} onChange={e => setManagerPassword(e.target.value)} className="mt-1 dark:bg-slate-950" placeholder="Enter password" autoFocus /></div>
                           {error && <div className="text-sm text-destructive text-left bg-destructive/10 p-2 rounded">{error}</div>}
                           <div className="flex gap-3"><Button type="button" variant="outline" className="flex-1" onClick={() => setDeleteStep("none")}>Cancel</Button><Button type="submit" variant="destructive" className="flex-1" disabled={sectionBusy === "delete" || !managerPassword}>{sectionBusy === "delete" ? "Deleting..." : "Confirm Delete"}</Button></div>
                        </form>
                     )}
                 </div>
               )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}