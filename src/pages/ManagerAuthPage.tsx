import { Link } from "react-router-dom";
import { Home, UserCog, Lock } from "lucide-react";
import AuthPage from "@/components/AuthPage";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
  "/backend";

export default function ManagerAuthPage({
  onAuth,
}: {
  onAuth: (u: { id: number | string; name: string; token?: string }) => void;
}) {
  const [pwOpen, setPwOpen] = useState(false);
  const [pendingUser, setPendingUser] = useState<{ id: number | string; name: string } | null>(
    null
  );
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const priorSessionRef = useRef<string | null>(null);
  const managerLoginSucceededRef = useRef(false);

  useEffect(() => {
    try {
      priorSessionRef.current = localStorage.getItem("synergy_user");
      localStorage.removeItem("synergy_user");
    } catch {}
    return () => {
      if (!managerLoginSucceededRef.current) {
        try {
          if (priorSessionRef.current != null) {
            localStorage.setItem("synergy_user", priorSessionRef.current);
          } else {
            localStorage.removeItem("synergy_user");
          }
        } catch {}
      }
    };
  }, []);

  const headerVariants = {
    hidden: { opacity: 0, y: -10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
  };

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingUser) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(pendingUser.id), password }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`HTTP ${res.status}: ${msg || "Invalid credentials"}`);
      }

      const data = await res.json();
      
      // SUPPORT BOTH FORMATS (LEGACY vs TOKEN)
      const user = data.user || data;
      const token = data.access_token;

      // STORE TOKEN IF PRESENT
      if (token) {
        localStorage.setItem("synergy_token", token);
      }

      managerLoginSucceededRef.current = true;
      onAuth(user);

    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  function cancelPassword() {
    setPwOpen(false);
    setPendingUser(null);
    setPassword("");
    setErr(null);
    try {
      if (priorSessionRef.current != null) {
        localStorage.setItem("synergy_user", priorSessionRef.current);
      } else {
        localStorage.removeItem("synergy_user");
      }
    } catch {}
  }

  return (
    <div
      data-theme="auth manager"
      className="relative min-h-screen overflow-hidden bg-slate-900 flex flex-col items-center justify-center px-4 py-12 font-['Inter',-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]"
    >
      <style>{`
        @keyframes floatSlow { 0%{transform:translate3d(-5%,-3%,0)} 50%{transform:translate3d(5%,3%,0)} 100%{transform:translate3d(-5%,-3%,0)} }
        @keyframes drift { 0%{transform:translate3d(4%,-4%,0)} 50%{transform:translate3d(-4%,4%,0)} 100%{transform:translate3d(4%,-4%,0)} }
        [data-theme~="manager"]{--accent-500:#0ea5e9; --accent-600:#0284c7; --accent-700:#0369a1; --muted:#94a3b8; --blob-a: rgba(14,165,233,0.14); --blob-b: rgba(59,130,246,0.12);}
        [data-theme~="auth"] .auth-skin .mb-6.flex.items-center.gap-3{display:none!important;}
        [data-theme~="auth"] .auth-skin .mb-4 > button{display:none!important;}
        [data-theme~="auth"] .auth-skin .mb-4 input[type="text"]{background:rgba(51,65,85,.8)!important;border-color:rgba(51,65,85,1)!important;color:#fff!important;height:2.5rem!important;border-radius:.75rem!important;padding-left:.875rem!important;transition:box-shadow .2s,border-color .2s,background .2s!important;}
        [data-theme~="auth"] .auth-skin .mb-4 input[type="text"]::placeholder{color:#64748b!important;}
        [data-theme~="auth"] .auth-skin .mb-4 input[type="text"]:focus{outline:none!important;border-color:var(--accent-600)!important;box-shadow:0 0 0 2px rgba(2,132,199,.45)!important;background:rgba(51,65,85,.9)!important;}
        [data-theme~="auth"] .auth-skin .grid{max-height:24rem;overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable both-edges;overscroll-behavior:contain;padding:6px;margin:-6px;}
        [data-theme~="auth"] .auth-skin .grid::-webkit-scrollbar{width:8px;height:8px;}
        [data-theme~="auth"] .auth-skin .grid::-webkit-scrollbar-thumb{background:#475569;border-radius:4px;}
        [data-theme~="auth"] .auth-skin .grid::-webkit-scrollbar-track{background:#1e293b;border-radius:4px;}
        [data-theme~="auth"] .auth-skin .grid button{background:rgba(51,65,85,.5)!important;border:1px solid rgba(51,65,85,1)!important;border-radius:.75rem!important;transition:transform .15s ease,border-color .15s ease,box-shadow .2s ease,background .15s ease!important;box-shadow:0 6px 16px -12px rgba(0,0,0,.6)!important;transform-origin:center;will-change:transform;contain:paint;backface-visibility:hidden;}
        [data-theme~="auth"] .auth-skin .grid button:hover{transform:scale(1.02)!important;border-color:var(--accent-600)!important;background:rgba(14,165,233,.32)!important;box-shadow:0 12px 28px -14px rgba(14,165,233,.45)!important;}
        .bg-blob{position:fixed;filter:blur(120px);pointer-events:none;z-index:1;-webkit-mask-image:radial-gradient(closest-side,#000 70%,transparent 100%);mask-image:radial-gradient(closest-side,#000 70%,transparent 100%);}
        .bg-blob-1{top:-33%;left:-25%;width:60rem;height:60rem;background:var(--blob-a);animation:floatSlow 20s ease-in-out infinite;border-radius:9999px;}
        .bg-blob-2{bottom:-33%;right:-25%;width:60rem;height:60rem;background:var(--blob-b);animation:drift 24s ease-in-out infinite;border-radius:9999px;}
        [data-theme~="auth"] .grain-overlay{-webkit-mask-image:radial-gradient(120% 80% at 50% 50%,#000 70%,transparent 100%);mask-image:radial-gradient(120% 80% at 50% 50%,#000 70%,transparent 100%);}
      `}</style>

      <div aria-hidden className="bg-blob bg-blob-1" />
      <div aria-hidden className="bg-blob bg-blob-2" />
      <div
        aria-hidden
        className="grain-overlay pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_500px_at_50%_-20%,rgba(255,255,255,0.06),transparent_70%),radial-gradient(900px_600px_at_50%_120%,rgba(255,255,255,0.06),transparent_70%)] z-[1]"
      />

      {!pwOpen && (
        <>
          <header className="mb-8 text-center relative z-20">
            <motion.div
              variants={headerVariants}
              initial="hidden"
              animate="visible"
              className="flex items-center justify-center gap-3"
              transition={{ type: "spring", stiffness: 100 }}
            >
              <Link
                to="/"
                className="flex items-center justify-center h-9 w-9 rounded-full border border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white transition-colors duration-200 shadow-lg"
                aria-label="Go home"
              >
                <Home className="h-4 w-4" />
              </Link>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Manager Workspace Sign-in
              </h2>
            </motion.div>
            <motion.p
              className="mt-2 text-sm text-slate-400 max-w-xs mx-auto"
              variants={headerVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              Choose your profile to coordinate teams and approvals.
            </motion.p>
          </header>

          <motion.div
            className="auth-skin relative z-20 w-full max-w-lg p-6 sm:p-8 bg-slate-800/90 backdrop-blur-xl rounded-2xl border border-slate-700/80 shadow-2xl shadow-slate-950/70 ring-1 ring-white/5 mx-auto"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-sky-500 to-blue-500 p-3">
                <UserCog className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="text-lg font-semibold leading-tight">
                  Sign in to the <span className="text-sky-400">Manager</span> Workspace
                </div>
                <div className="text-sm text-slate-300">
                  Select your profile below to continue.
                </div>
              </div>
            </div>

            <AuthPage
              onAuth={(u) => {
                setPendingUser(u);
                setPwOpen(true);
              }}
              variant="manager"
              filterByRole
              delegateAuth={true}
            />
          </motion.div>

          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
            <div className="pointer-events-auto rounded-full border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm text-slate-300 backdrop-blur-md transition-shadow hover:shadow-lg hover:shadow-slate-900/50">
              Select a different workspace?{" "}
              <Link
                className="text-sky-300 hover:text-sky-200 font-medium underline-offset-4 decoration-sky-500/50 hover:decoration-sky-400"
                to="/"
              >
                Back to selection
              </Link>
            </div>
          </div>
        </>
      )}

      {pwOpen && (
        <div className="relative z-20 w-full max-w-sm mx-auto bg-slate-800/95 p-6 rounded-xl border border-slate-700 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg bg-sky-600/20 p-2">
              <Lock className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Manager verification</h3>
              <p className="text-sm text-slate-400">
                {pendingUser ? `Verify ${pendingUser.name}` : "Verify your identity"}
              </p>
            </div>
          </div>

          <form onSubmit={submitPassword} className="space-y-4">
            <input
              type="password"
              placeholder="Manager password"
              className="w-full h-10 px-4 rounded-xl bg-slate-700/80 text-white border border-slate-700 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 placeholder:text-slate-500 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              disabled={busy}
            />

            {err && <p className="text-xs text-rose-400">{err}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelPassword}
                className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-700/50 transition-colors"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-sky-600 rounded-xl text-white font-semibold hover:bg-sky-700 transition-colors disabled:opacity-60"
                disabled={!password || busy}
              >
                {busy ? "Verifying…" : "Verify"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}