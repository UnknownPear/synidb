import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import AuthPage from "@/components/AuthPage";

export default function AdminAuthPage({ onAuth }: { onAuth: (u:{id:number;name:string}) => void }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Gaussian background blobs - Animated */}
      <style>{`
        @keyframes floatSlow { 0%{transform:translate3d(-10%,-5%,0) scale(1)} 50%{transform:translate3d(10%,5%,0) scale(1.05)} 100%{transform:translate3d(-10%,-5%,0) scale(1)} }
        @keyframes drift { 0%{transform:translate3d(8%,-6%,0) scale(1.1) rotate(0)} 50%{transform:translate3d(-6%,6%,0) scale(1.15) rotate(15deg)} 100%{transform:translate3d(8%,-6%,0) scale(1.1) rotate(0)} }
      `}</style>
      <div aria-hidden className="pointer-events-none absolute -top-1/3 -left-1/4 w-[60rem] h-[60rem] rounded-full bg-gradient-to-br from-emerald-500/30 via-teal-500/20 to-sky-500/10 blur-[120px]" style={{animation:"floatSlow 24s ease-in-out infinite"}} />
      <div aria-hidden className="pointer-events-none absolute -bottom-1/3 -right-1/4 w-[60rem] h-[60rem] rounded-full bg-gradient-to-br from-cyan-400/25 via-blue-400/20 to-indigo-400/10 blur-[120px]" style={{animation:"drift 28s ease-in-out infinite"}} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-20%,rgba(255,255,255,0.06),transparent_60%),radial-gradient(1000px_700px_at_50%_120%,rgba(255,255,255,0.06),transparent_60%)]" />

      {/* Home */}
      <Link
        to="/"
        className="fixed left-4 top-4 z-50 inline-flex items-center gap-2 rounded-xl border border-white/15
                   bg-white/10 px-3 py-2 text-sm font-medium text-white backdrop-blur-xl
                   hover:bg-white/15 focus:outline-none"
        aria-label="Go home"
      >
        <Home className="h-4 w-4" />
        <span>Home</span>
      </Link>

      {/* Auth content: Removed redundant/incorrect 'chrome="glass"' prop */}
      <div className="relative z-10">
        <AuthPage onAuth={onAuth} variant="admin" filterByRole />
      </div>

      {/* Bottom helper */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center">
        <div className="pointer-events-auto rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs text-white/80 backdrop-blur-md">
          Need a different workspace? <Link className="underline hover:opacity-90" to="/">Back to selection</Link>
        </div>
      </div>
    </div>
  );
}