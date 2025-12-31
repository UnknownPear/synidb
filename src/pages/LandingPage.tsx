import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  ShieldCheck, 
  Zap, 
  BarChart3, 
  Layers, 
  ArrowRight, 
  ChevronRight,
  Globe
} from "lucide-react";
import Aurora from "../utils/Aurora";

export default function LandingPage() {
  const nav = useNavigate();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1, 
      transition: { staggerChildren: 0.2, delayChildren: 0.3 } 
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } }
  };

  return (
    <div className="relative min-h-screen w-full bg-slate-950 text-slate-200 selection:bg-indigo-500/30 font-['Inter',sans-serif]">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
        <Aurora colorStops={["#4F46E5", "#0EA5E9", "#1E293B"]} speed={0.4} />
      </div>

      {/* Navigation Header */}
      <nav className="relative z-20 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Layers className="text-white h-6 w-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Synergy</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#workflow" className="hover:text-white transition-colors">Workflow</a>
          <button 
            onClick={() => nav("/loginnew")}
            className="px-5 py-2.5 rounded-full bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 transition-all"
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="text-center"
        >
          <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-6">
            <Zap className="h-3 w-3" />
            <span>v2.0 Now Live for Enterprise</span>
          </motion.div>

          <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl font-extrabold text-white tracking-tight mb-6 leading-[1.1]">
            Your Inventory, <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400">
              Synergized.
            </span>
          </motion.h1>

          <motion.p variants={itemVariants} className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            The all-in-one workspace for testers, posters, and managers. 
            Bridge the gap between hardware testing and global marketplace listing.
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={() => nav("/loginnew")}
              className="group relative w-full sm:w-auto px-8 py-4 bg-white text-slate-950 font-bold rounded-2xl hover:scale-105 transition-all flex items-center justify-center gap-2 overflow-hidden"
            >
              Get Started
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="w-full sm:w-auto px-8 py-4 bg-slate-900/50 backdrop-blur-md border border-slate-700 text-white font-semibold rounded-2xl hover:bg-slate-800 transition-all">
              View Demo
            </button>
          </motion.div>

          {/* Feature Grid Preview */}
          <motion.div 
            variants={itemVariants}
            className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <FeatureCard 
              icon={<ShieldCheck className="text-indigo-400" />}
              title="Tester Verified"
              desc="Comprehensive grade logging and diagnostic reporting."
            />
            <FeatureCard 
              icon={<Globe className="text-sky-400" />}
              title="Direct Listing"
              desc="One-click posting to eBay and internal marketplaces."
            />
            <FeatureCard 
              icon={<BarChart3 className="text-emerald-400" />}
              title="Manager Suite"
              desc="Real-time analytics and team performance tracking."
            />
          </motion.div>
        </motion.div>
      </main>

      {/* Subtle Footer */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950/50 py-12 text-center text-slate-500 text-sm">
        <p>© 2025 Synergy Operations. All rights reserved.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800/50 backdrop-blur-sm text-left hover:border-slate-700 transition-colors group">
      <div className="h-12 w-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}