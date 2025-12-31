import React, { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Feather, UserSearch, UserCog, Lock } from "lucide-react";
import type { LucideIcon as LucideIconType } from "lucide-react";
import { listUsers, userLogin } from "@/lib/usersApi";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type Role = "Tester" | "Poster" | "Admin" | "Manager";

type AppUser = {
  id: number | string;
  name: string;
  initials: string;
  role: string;       
  roles?: string[];   
  active: boolean;
  avatar_url: string | null;
  has_password: boolean;
};

type Props = {
  onAuth: (u: AppUser) => void;
  variant?: "tester" | "poster" | "admin" | "manager";
  filterByRole?: boolean;
  delegateAuth?: boolean;
};

const STORAGE_KEY = "synergy_user";
const TOKEN_KEY = "synergy_token"; // New constant for token

const Avatar: React.FC<{ user: AppUser; size?: "sm" | "lg" }> = ({
  user,
  size = "sm",
}) => {
  const sizeClasses =
    size === "sm" ? "h-10 w-10 text-base" : "h-24 w-24 text-4xl";

  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name || user.initials || "User avatar"}
        className={cn(
          "rounded-full object-cover bg-gray-200 shrink-0",
          sizeClasses
        )}
      />
    );
  }

  const initials =
    (user.initials && user.initials.trim().slice(0, 2)) ||
    (user.name || "?")
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 font-semibold text-white shrink-0",
        sizeClasses
      )}
    >
      {initials}
    </div>
  );
};

const roleInfo: Record<NonNullable<Props["variant"]>, { label: string; color: string; icon: LucideIconType }> = {
  tester: { label: "Tester", color: "from-blue-500 to-indigo-500", icon: Feather },
  poster: { label: "Poster", color: "from-emerald-500 to-teal-500", icon: UserSearch },
  admin: { label: "Admin", color: "from-amber-500 to-pink-500", icon: ShieldCheck },
  manager:{ label: "Manager", color: "from-sky-500 to-blue-500", icon: UserCog },
};

export default function AuthPage({ 
  onAuth, 
  variant = "tester", 
  filterByRole = false,
  delegateAuth = false
}: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const u = JSON.parse(raw);
        const userRoles = (u.roles || [u.role]).map((r: string) => r.toLowerCase());
        const target = variant.toLowerCase();
        
        if (u && u.id && u.name && userRoles.includes(target)) {
          onAuth(u);
        }
      } catch (e) {
        console.error("Failed to parse stored user", e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data: AppUser[] = await listUsers({ active: true }); 
        if (isMounted) setUsers(data || []);
      } catch (e: any) {
        if (isMounted) setError(e?.message || "Failed to load users");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [filterByRole, variant]);

  const filtered = useMemo(() => {
    const needle = (q || "").toLowerCase().trim();
    const targetRole = variant.toLowerCase();

    return (users || []).filter((u) => {
      if (!u.active) return false;

      if (filterByRole) {
        const userRoles = (u.roles || [u.role]).map(r => r.toLowerCase());
        if (!userRoles.includes(targetRole)) {
          return false;
        }
      }

      if (!needle) return true;
      return u.name.toLowerCase().includes(needle) || u.initials.toLowerCase().includes(needle);
    });
  }, [users, q, filterByRole, variant]);

  function handleUserSelect(user: AppUser) {
    setError(null);
    
    if (delegateAuth) {
      onAuth(user);
      return;
    }

    if (user.has_password) {
      setSelectedUser(user);
      setPasswordModalOpen(true);
    } else {
      // For users without password, we can't get a token (requires password).
      // They will continue using Legacy Auth (X-User-ID) which works in Hybrid mode.
      loginSuccess(user);
    }
  }
  
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser || !password) return;
    setIsLoggingIn(true);
    setError(null);
    try {
      // Calls API which might return { user: {...}, access_token: "..." } OR just { ...user... }
      const response: any = await userLogin(selectedUser.id, password);
      
      // Handle Token Extraction
      const userObj = response.user || response;
      const token = response.access_token;

      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      }

      loginSuccess(userObj);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setIsLoggingIn(false);
    }
  }

  function loginSuccess(user: AppUser) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...user, ts: Date.now() }));
    onAuth(user);
  }

  return (
    <>
      <div className="mx-auto max-w-4xl px-6 py-10 text-white">
        {/* Search Bar */}
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/40" placeholder="Search by name or initials…" value={q} onChange={(e) => setQ(e.target.value)}/>
            <UserSearch className="pointer-events-none absolute right-2 top-2 h-5 w-5 opacity-60" />
          </div>
        </div>
        
        {/* User Grid */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          {loading ? ( <div className="py-6 text-center text-white/70">Loading users…</div> ) : 
          error ? ( <div className="rounded-lg border border-red-400/30 bg-red-500/15 p-3 text-sm text-red-100">{error}</div> ) : 
          filtered.length === 0 ? (
            <div className="py-6 text-center text-white/70">No matching profiles found.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3">
              {filtered.map((u) => (
                <button
                  key={String(u.id)}
                  onClick={() => handleUserSelect(u)}
                  className="group relative flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-center shadow-sm transition hover:border-white/25 hover:bg-black/30"
                >
                  <div className="relative">
                    <Avatar user={u} size="sm" />
                    {u.has_password && (
                      <div className="absolute -top-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-800 bg-slate-600">
                        <Lock className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="w-full">
                    <div className="text-xs font-medium leading-snug break-words">
                      {u.name?.trim() || u.initials?.trim() || "Unnamed"}
                    </div>
                    <div className="mt-1 flex flex-wrap justify-center gap-1">
                      {(u.roles || [u.role]).slice(0, 2).map((r, i) => (
                        <span key={i} className="text-[9px] uppercase tracking-wide opacity-70 bg-white/10 px-1 rounded border border-white/5">
                          {r}
                        </span>
                      ))}
                      {(u.roles || []).length > 2 && <span className="text-[9px] opacity-50">+{u.roles!.length - 2}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Password Modal */}
      {passwordModalOpen && selectedUser && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.form
            onSubmit={handlePasswordLogin}
            className="w-full max-w-sm bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-2xl space-y-4"
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-sky-600/20 p-2">
                <Lock className="h-5 w-5 text-sky-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Verification Required</h3>
                <p className="text-sm text-slate-400">
                  Enter password for {selectedUser.name}
                </p>
              </div>
            </div>

            <input
              type="password"
              placeholder="Password"
              className="w-full h-10 px-4 rounded-xl bg-slate-700/80 text-white border border-slate-700 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 placeholder:text-slate-500 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              disabled={isLoggingIn}
            />

            {error && <p className="text-xs text-rose-400">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setPasswordModalOpen(false); setSelectedUser(null); setPassword(""); setError(null); }}
                className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-700/50 transition-colors"
                disabled={isLoggingIn}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-sky-600 rounded-xl text-white font-semibold hover:bg-sky-700 transition-colors disabled:opacity-60"
                disabled={!password || isLoggingIn}
              >
                {isLoggingIn ? "Verifying…" : "Verify"}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </>
  );
}