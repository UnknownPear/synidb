import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import AuthPage from "@/components/AuthPage";
import { motion } from "framer-motion";

export default function PosterAuthPage({
  onAuth,
}: {
  onAuth: (u: { id: number | string; name: string; token?: string }) => void;
}) {
  const headerVariants = {
    hidden: { opacity: 0, y: -10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
  };

  return (
    <div
      data-theme="auth poster"
      className="relative min-h-screen overflow-hidden bg-slate-900 flex flex-col items-center justify-center px-4 py-12 font-['Inter',-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]"
    >
      <style>{`
        @keyframes floatSlow { 0%{transform:translate3d(-5%,-3%,0)} 50%{transform:translate3d(5%,3%,0)} 100%{transform:translate3d(-5%,-3%,0)} }
        @keyframes drift { 0%{transform:translate3d(4%,-4%,0)} 50%{transform:translate3d(-4%,4%,0)} 100%{transform:translate3d(4%,-4%,0)} }
        [data-theme~="poster"]{ --accent-500:#10b981; --accent-600:#059669; --accent-700:#047857; --muted:#94a3b8; --blob-a: rgba(16,185,129,0.14); --blob-b: rgba(45,212,191,0.12); }
        [data-theme~="auth"] .auth-skin .mb-6.flex.items-center.gap-3{display:none!important;}
        [data-theme~="auth"] .auth-skin .mb-4 input[type="text"]{ background:rgba(51,65,85,.8)!important;border-color:rgba(51,65,85,1)!important;color:#fff!important;height:2.5rem!important;border-radius:.75rem!important;padding-left:.875rem!important;transition:box-shadow .2s,border-color .2s,background .2s!important; }
        [data-theme~="auth"] .auth-skin .mb-4 input[type="text"]::placeholder{color:#64748b!important;}
        [data-theme~="auth"] .auth-skin .mb-4 input[type="text"]:focus{ outline:none!important;border-color:var(--accent-600)!important;box-shadow:0 0 0 2px rgba(5,150,105,.45)!important;background:rgba(51,65,85,.9)!important; }
        [data-theme~="auth"] .auth-skin .mb-4>button, [data-theme~="auth"] .auth-skin form button[type="submit"]{ background:var(--accent-600)!important;color:#fff!important;border:1px solid transparent!important;border-radius:.75rem!important;font-weight:600!important; box-shadow:0 10px 25px -10px rgba(5,150,105,.5)!important;transition:transform .15s ease,box-shadow .2s ease,background .15s ease!important;will-change:transform; }
        [data-theme~="auth"] .auth-skin .mb-4>button:hover, [data-theme~="auth"] .auth-skin form button[type="submit"]:hover{ background:var(--accent-700)!important;transform:translateY(-1px)!important;box-shadow:0 14px 30px -12px rgba(5,150,105,.6)!important; }
        [data-theme~="auth"] .auth-skin .grid{max-height:24rem;overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable both-edges;overscroll-behavior:contain;padding:6px;margin:-6px;}
        [data-theme~="auth"] .auth-skin .grid::-webkit-scrollbar{width:8px;height:8px;}
        [data-theme~="auth"] .auth-skin .grid::-webkit-scrollbar-thumb{background:#475569;border-radius:4px;}
        [data-theme~="auth"] .auth-skin .grid::-webkit-scrollbar-track{background:#1e293b;border-radius:4px;}
        [data-theme~="auth"] .auth-skin .grid button{ background:rgba(51,65,85,.5)!important;border:1px solid rgba(51,65,85,1)!important;border-radius:.75rem!important; transition:transform .15s ease,border-color .15s ease,box-shadow .2s ease,background .15s ease!important; box-shadow:0 6px 16px -12px rgba(0,0,0,.6)!important;transform-origin:center;will-change:transform;contain:paint;backface-visibility:hidden; }
        [data-theme~="auth"] .auth-skin .grid button:hover{ transform:scale(1.02)!important;border-color:var(--accent-600)!important;background:rgba(16,185,129,.3)!important; box-shadow:0 12px 28px -14px rgba(16,185,129,.45)!important; }
        .bg-blob{position:fixed;filter:blur(120px);pointer-events:none;z-index:1; -webkit-mask-image:radial-gradient(closest-side,#000 70%,transparent 100%);mask-image:radial-gradient(closest-side,#000 70%,transparent 100%); }
        .bg-blob-1{top:-33%;left:-25%;width:60rem;height:60rem;background:var(--blob-a);animation:floatSlow 20s ease-in-out infinite;border-radius:9999px;}
        .bg-blob-2{bottom:-33%;right:-25%;width:60rem;height:60rem;background:var(--blob-b);animation:drift 24s ease-in-out infinite;border-radius:9999px;}
        [data-theme~="auth"] .grain-overlay{ -webkit-mask-image:radial-gradient(120% 80% at 50% 50%,#000 70%,transparent 100%);mask-image:radial-gradient(120% 80% at 50% 50%,#000 70%,transparent 100%); }
      `}</style>
      <div aria-hidden className="bg-blob bg-blob-1" />
      <div aria-hidden className="bg-blob bg-blob-2" />
      <div aria-hidden className="grain-overlay pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_500px_at_50%_-20%,rgba(255,255,255,0.06),transparent_70%),radial-gradient(900px_600px_at_50%_120%,rgba(255,255,255,0.06),transparent_70%)] z-[1]" />
      <header className="mb-8 text-center relative z-20">
        <motion.div variants={headerVariants} initial="hidden" animate="visible" className="flex items-center justify-center gap-3" transition={{ type: "spring", stiffness: 100 }}>
          <Link to="/" className="flex items-center justify-center h-9 w-9 rounded-full border border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white transition-colors duration-200 shadow-lg" aria-label="Go home">
            <Home className="h-4 w-4" />
          </Link>
          <h2 className="text-xl font-bold text-white tracking-tight">Poster Workspace Sign-in</h2>
        </motion.div>
        <motion.p className="mt-2 text-sm text-slate-400 max-w-xs mx-auto" variants={headerVariants} initial="hidden" animate="visible" transition={{ delay: 0.3, duration: 0.5 }}>
          Choose your profile to start posting.
        </motion.p>
      </header>
      <motion.div className="auth-skin relative z-20 w-full max-w-lg p-6 sm:p-8 bg-slate-800/90 backdrop-blur-xl rounded-2xl border border-slate-700/80 shadow-2xl shadow-slate-950/70 ring-1 ring-white/5" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4, delay: 0.2 }}>
        <AuthPage onAuth={onAuth} variant="poster" filterByRole />
      </motion.div>
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
        <div className="pointer-events-auto rounded-full border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm text-slate-300 backdrop-blur-md transition-shadow hover:shadow-lg hover:shadow-slate-900/50">
          Select a different workspace? <Link className="text-emerald-300 hover:text-emerald-200 font-medium underline-offset-4 decoration-emerald-500/50 hover:decoration-emerald-400" to="/">Back to selection</Link>
        </div>
      </div>
    </div>
  );
}