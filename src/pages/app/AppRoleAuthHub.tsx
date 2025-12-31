import { useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  LogOut,
  Moon,
  Sun,
  Zap,
  UserCog,
  ClipboardCheck,
  Megaphone,
  Wrench,
  ChevronRight,
  Lock,
  CheckCircle2,
} from "lucide-react";
import Aurora from "../../utils/Aurora";

// Types
type Theme = "light" | "dark";

// Interface matches the props passed from the main controller
interface AppRoleAuthHubProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  effectsEnabled: boolean;
  setEffectsEnabled: (enabled: boolean) => void;
  session: { id: number | string; name: string; role?: string; roles?: string[] } | null;
  active: { tester: boolean; poster: boolean; manager: boolean };
  gotoLogin: (role: "tester" | "poster" | "manager") => void;
  continueTo: (role: "tester" | "poster" | "manager") => void;
  signOut: () => void;
  nav: ReturnType<typeof useNavigate>;
  isLight: boolean; 
  pal?: any; // Optional, as we define a better palette internally here
}

export default function AppRoleAuthHub(props: AppRoleAuthHubProps) {
  const {
    theme,
    setTheme,
    effectsEnabled,
    setEffectsEnabled,
    session,
    active,
    gotoLogin,
    continueTo,
    signOut,
    nav,
  } = props;

  // Derive isLight from theme directly to ensure sync
  const isLight = theme === "light";

  // Native macOS-like Palette
  const pal = isLight
    ? {
        rootBg: "bg-[#F5F7FA] text-slate-900", // Mac window background
        surface: "bg-white border-slate-200",
        surfaceStrong: "bg-white border-slate-200",
        muted: "text-slate-500",
        subtle: "text-slate-400",
        hairline: "border-slate-200", // Subtle separators
        shadow: "shadow-sm",
        tile: "bg-white border-slate-200/80 hover:border-indigo-500/50 hover:shadow-md",
        tileShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.04)]",
        iconBg: "bg-indigo-50 text-indigo-600",
        iconBgActive: "bg-emerald-50 text-emerald-600",
        pill: "bg-white border-slate-200 shadow-sm",
        pillBtn: "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
        pillBtnActive: "bg-slate-100 text-slate-900",
        danger: "text-rose-500 hover:bg-rose-50",
      }
    : {
        rootBg: "bg-[#0F1115] text-slate-100", // Deep dark macOS bg
        surface: "bg-[#1A1D24] border-white/5",
        surfaceStrong: "bg-[#20242C] border-white/5",
        muted: "text-slate-400",
        subtle: "text-slate-500",
        hairline: "border-white/5",
        shadow: "shadow-none",
        tile: "bg-[#15171C] border-white/5 hover:bg-[#1A1D24] hover:border-indigo-500/30",
        tileShadow: "shadow-none",
        iconBg: "bg-indigo-500/10 text-indigo-400",
        iconBgActive: "bg-emerald-500/10 text-emerald-400",
        pill: "bg-[#1A1D24] border-white/5",
        pillBtn: "text-slate-400 hover:bg-white/5 hover:text-white",
        pillBtnActive: "bg-white/10 text-white",
        danger: "text-rose-400 hover:bg-rose-500/10",
      };

  const title = "Workspace";
  const subtitle = session ? `Logged in as ${session.name}` : "Select a role";

  return (
    <div className={`relative h-screen w-full overflow-hidden ${pal.rootBg} flex flex-col font-['Inter',sans-serif] select-none transition-colors duration-300`}>
      
      {/* Background Effects */}
      {effectsEnabled && (
        <>
          {!isLight && (
            <div className="absolute inset-0 z-0 pointer-events-none opacity-25">
              <Aurora colorStops={["#1E293B", "#312E81", "#0F172A"]} amplitude={0.5} speed={0.4} />
            </div>
          )}
          {/* Subtle noise texture for native feel */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0 mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>
        </>
      )}

      {/* Header Bar */}
      <div className={`relative z-10 flex items-center justify-between px-6 py-4 border-b shrink-0 backdrop-blur-xl ${pal.hairline}`} style={{ backgroundColor: isLight ? 'rgba(255,255,255,0.6)' : 'rgba(15,17,21,0.6)' }}>
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center border ${pal.hairline} ${pal.surface}`}>
            <LayoutGrid size={16} className={isLight ? "text-indigo-600" : "text-indigo-400"} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight leading-none">{title}</h1>
            <p className={`text-[10px] font-medium mt-0.5 ${pal.subtle}`}>{subtitle}</p>
          </div>
        </div>

        {/* Toolbar Pill */}
        <div className={`flex items-center gap-1 p-1 rounded-lg border ${pal.pill}`}>
          <AppIconButton
            icon={isLight ? Moon : Sun}
            onClick={() => setTheme(isLight ? "dark" : "light")}
            className={pal.pillBtn}
            tooltip="Toggle Theme"
          />
          <AppIconButton
            icon={Zap}
            onClick={() => setEffectsEnabled(!effectsEnabled)}
            className={pal.pillBtn}
            isActive={effectsEnabled}
            activeClass={pal.pillBtnActive}
            tooltip="Toggle Effects"
          />
          {session && (
            <>
              <div className={`w-px h-3 mx-1 ${pal.hairline}`} />
              <AppIconButton
                icon={LogOut}
                onClick={signOut}
                className={pal.danger}
                tooltip="Sign Out"
              />
            </>
          )}
        </div>
      </div>

      {/* Main Grid Area */}
      <div className="relative z-10 flex-1 p-6 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
          <AppRoleCard
            pal={pal}
            title="Tester"
            desc="Diagnostics"
            Icon={ClipboardCheck}
            isActive={active.tester}
            onClick={() => (active.tester ? continueTo("tester") : gotoLogin("tester"))}
          />
          <AppRoleCard
            pal={pal}
            title="Poster"
            desc="Marketplace"
            Icon={Megaphone}
            isActive={active.poster}
            onClick={() => (active.poster ? continueTo("poster") : gotoLogin("poster"))}
          />
          <AppRoleCard
            pal={pal}
            title="Manager"
            desc="Admin"
            Icon={UserCog}
            isActive={active.manager}
            onClick={() => (active.manager ? continueTo("manager") : gotoLogin("manager"))}
          />
        </div>
      </div>

      {/* Bottom Utility Bar */}
      <div className={`relative z-10 px-6 pb-6 shrink-0`}>
        <AppUtilityBar pal={pal} onClick={() => nav("/utilities")} />
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function AppRoleCard({ pal, title, desc, Icon, isActive, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`group relative h-full w-full min-h-[160px] rounded-2xl border flex flex-col justify-between p-5 text-left transition-all duration-200 ${pal.tile} ${pal.tileShadow} hover:-translate-y-0.5`}
    >
      <div className="flex justify-between items-start w-full">
        {/* Icon Box */}
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${pal.hairline} ${isActive ? pal.iconBgActive : pal.iconBg}`}>
          <Icon size={20} />
        </div>
        
        {/* Status Badge */}
        <div className={`px-2 py-0.5 rounded-md border text-[9px] font-bold tracking-wider flex items-center gap-1 ${isActive ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-slate-500/10 border-slate-500/20 text-slate-500"}`}>
          {isActive ? <CheckCircle2 size={10} /> : <Lock size={10} />}
          {isActive ? "ACTIVE" : "LOCKED"}
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-lg font-bold tracking-tight">{title}</h3>
        <div className={`text-[11px] font-medium uppercase tracking-wide mt-0.5 ${pal.subtle}`}>{desc}</div>
      </div>

      <div className={`mt-4 flex items-center text-[11px] font-semibold transition-colors ${isActive ? "text-indigo-500 group-hover:text-indigo-400" : "text-slate-400"}`}>
        {isActive ? "Open Workspace" : "Sign In Required"}
        <ChevronRight size={14} className="ml-1 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

function AppUtilityBar({ pal, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border p-3 flex items-center justify-between transition-all duration-200 hover:-translate-y-0.5 ${pal.surface} ${pal.shadow} hover:border-indigo-500/30`}
    >
      <div className="flex items-center gap-3">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${pal.rootBg}`}>
          <Wrench size={16} className={pal.muted} />
        </div>
        <div className="text-left">
          <div className="text-xs font-bold">System Utilities</div>
          <div className={`text-[10px] ${pal.subtle}`}>Hardware diagnostics & tools</div>
        </div>
      </div>
      <ChevronRight size={16} className={pal.subtle} />
    </button>
  );
}

function AppIconButton({ icon: Icon, onClick, className, activeClass, isActive, tooltip }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={`h-7 w-7 rounded-md flex items-center justify-center transition-all ${className} ${isActive ? activeClass : ""}`}
    >
      <Icon size={14} />
    </button>
  );
}