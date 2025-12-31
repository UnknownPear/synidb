import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, User, Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import Aurora from "../utils/Aurora";

export default function UnifiedLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // Design tokens matching your RoleAuthHub palette
  const pal = {
    cardBg: "bg-slate-900/40",
    inputBg: "bg-slate-800/50",
    accent: "from-indigo-500 to-blue-600",
    border: "border-slate-700/50"
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    // Logic: Authenticate -> Store JWT -> Redirect to Hub
    setTimeout(() => setIsBusy(false), 1500); 
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-slate-950">
      {/* Background Layer: Reusing your Aurora component */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
        <Aurora colorStops={["#6366f1", "#3b82f6", "#1e293b"]} speed={0.5} />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative z-10 w-full max-w-md p-1 px-4`}
      >
        <div className={`backdrop-blur-2xl ${pal.cardBg} rounded-3xl border ${pal.border} shadow-2xl overflow-hidden`}>
          
          {/* Header Section */}
          <div className="pt-8 pb-6 px-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-indigo-500/30 mb-4">
              <ShieldCheck className="w-8 h-8 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Synergy Tools</h1>
            <p className="text-slate-400 text-sm mt-2">Sign in to access your workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 pb-10 space-y-5">
            {/* Email/Username Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 ml-1">Identity</label>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                <input
                  type="text"
                  placeholder="Username or Email"
                  className={`w-full h-11 pl-10 pr-4 rounded-xl ${pal.inputBg} border ${pal.border} text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center px-1">
                <label className="text-xs font-medium text-slate-300">Password</label>
                <button type="button" className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors">Forgot?</button>
              </div>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className={`w-full h-11 pl-10 pr-10 rounded-xl ${pal.inputBg} border ${pal.border} text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              disabled={isBusy}
              className={`w-full h-12 relative overflow-hidden group rounded-xl bg-gradient-to-r ${pal.accent} text-white font-semibold shadow-lg shadow-indigo-500/25 active:scale-[0.98] transition-all disabled:opacity-70`}
            >
              <AnimatePresence mode="wait">
                {isBusy ? (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-2"
                  >
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying...</span>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="static"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-2"
                  >
                    <span>Secure Sign In</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </form>

          {/* Footer Warning (Optional) */}
          <div className="bg-slate-800/30 p-4 border-t border-slate-700/50 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
              Authorized Personnel Only
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}