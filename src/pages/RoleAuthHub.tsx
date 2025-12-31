import { useNavigate, useSearchParams } from "react-router-dom";
import { UserCog, ClipboardCheck, Megaphone, Zap, Wrench, Sun, Moon } from "lucide-react";
import Aurora from "../utils/Aurora"; 
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SynergyLoader from "@/components/ui/SynergyLoader";

// IMPORT THE APP VIEW
import AppRoleAuthHub from "./app/AppRoleAuthHub";

const PREVIEW_KEY = "auth_preview_role";
const EFFECTS_KEY = "rah_effects_enabled";
const THEME_KEY = "rah_theme";
const INTRO_TIMESTAMP_KEY = "rah_intro_timestamp";
const INTRO_COOLDOWN_MS = 1800000; 

type Theme = "light" | "dark";

export default function RoleAuthHub() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  
  // --- 1. DETECTION LOGIC ---
  const [isAppMode, setIsAppMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    
    // Check 1: User Agent (Specific to Tauri App)
    if (navigator.userAgent.includes("SynergyClient")) return true;
    
    // Check 2: URL Hash (The most reliable signal)
    if (window.location.hash.includes("app_mode")) return true;
    
    // Check 3: URL Param
    if (new URLSearchParams(window.location.search).get("mode") === "app") return true;

    // REMOVED: sessionStorage check. This forces it to re-verify every load.
    return false; 
  });

  useEffect(() => {
    // A. Check User Agent (Best for Tauri)
    if (navigator.userAgent.includes("SynergyClient")) {
        setIsAppMode(true);
        sessionStorage.setItem("synergy_app_detected", "true");
        return;
    }
    // B. Check URL Param
    if (searchParams.get("mode") === "app") {
        setIsAppMode(true);
        sessionStorage.setItem("synergy_app_detected", "true");
        return;
    }
    // C. Check URL Hash (Survives Redirects)
    if (window.location.hash.includes("app_mode")) {
        setIsAppMode(true);
        sessionStorage.setItem("synergy_app_detected", "true");
        return;
    }
    // D. Check Broadcast Signal
    const handleMessage = (event: MessageEvent) => {
      if (event.data === "SYNERGY_APP_MODE") {
        setIsAppMode(true);
        sessionStorage.setItem("synergy_app_detected", "true");
      }
    };
    window.addEventListener("message", handleMessage);
    
    // E. Persistence
    if (sessionStorage.getItem("synergy_app_detected") === "true") setIsAppMode(true);
    
    return () => window.removeEventListener("message", handleMessage);
  }, [searchParams]);

  // --- 2. SHARED STATE ---
  const [theme, setTheme] = useState<Theme>(() => {
    // Force Dark in App Mode
    if (typeof window !== "undefined" && sessionStorage.getItem("synergy_app_detected") === "true") return "dark";
    try {
      const saved = localStorage.getItem(THEME_KEY) as Theme | null;
      return saved || "dark";
    } catch { return "dark"; }
  });

  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("synergy_user");
      setSession(raw ? JSON.parse(raw) : null);
      setToken(localStorage.getItem("synergy_auth_token"));
    } catch { setSession(null); }
  }, []);

  useEffect(() => { try { localStorage.setItem(THEME_KEY, theme); } catch {} }, [theme]);
  useEffect(() => { try { localStorage.setItem(EFFECTS_KEY, String(effectsEnabled)); } catch {} }, [effectsEnabled]);

  const isLight = theme === "light";
  
  const userRoles = useMemo(() => {
    const rs = session?.roles || (session?.role ? [session.role] : []);
    return rs.map((x: string) => x.toLowerCase());
  }, [session]);

  const active = useMemo(() => ({
      tester: userRoles.includes("tester") || userRoles.includes("manager") || userRoles.includes("admin"),
      poster: userRoles.includes("poster") || userRoles.includes("manager") || userRoles.includes("admin"),
      manager: (userRoles.includes("manager") || userRoles.includes("admin")) && !!token,
  }), [userRoles, token]);

  const gotoLogin = (role: "tester" | "poster" | "manager") => {
    try { sessionStorage.setItem(PREVIEW_KEY, role); } catch {}
    if (role === "tester") return nav("/login/testers");
    if (role === "poster") return nav("/login/posters");
    if (role === "manager") return nav("/login/manager");
  };

  const continueTo = (role: "tester" | "poster" | "manager") => {
    if (role === "tester") return nav("/tester");
    if (role === "poster") return nav("/poster");
    if (role === "manager") return nav("/manager");
  };

  const signOut = () => { localStorage.removeItem("synergy_user"); setSession(null); };

  // Intro (Web Only)
  const [showIntro, setShowIntro] = useState(() => {
    if (isAppMode) return false;
    try {
      const now = Date.now();
      const lastShown = localStorage.getItem(INTRO_TIMESTAMP_KEY);
      if (!lastShown || (now - parseInt(lastShown)) > INTRO_COOLDOWN_MS) {
        localStorage.setItem(INTRO_TIMESTAMP_KEY, String(now));
        return true;
      }
      return false; 
    } catch { return true; }
  });
  useEffect(() => { if (!showIntro) return; const timer = setTimeout(() => setShowIntro(false), 3200); return () => clearTimeout(timer); }, [showIntro]);


  // =========================================================
  // RENDER SWITCH
  // =========================================================
  
  if (isAppMode) {
    return (
      <AppRoleAuthHub 
        theme={theme} setTheme={setTheme}
        effectsEnabled={effectsEnabled} setEffectsEnabled={setEffectsEnabled}
        session={session} active={active}
        gotoLogin={gotoLogin} continueTo={continueTo} signOut={signOut}
        nav={nav} isLight={isLight} pal={{}}
      />
    );
  }

  // =========================================================
  // VIEW: WEB MODE (Original Scrollable Design)
  // =========================================================
  const pal = {
    pageBg: isLight ? "bg-gray-50" : "bg-gray-900",
    textMain: isLight ? "text-gray-900" : "text-white",
    textMuted: isLight ? "text-gray-600" : "text-gray-300",
    stripBg: isLight ? "bg-white/70" : "bg-gray-800/50",
    stripBorder: isLight ? "border-gray-200" : "border-gray-700/70",
    badgeBg: isLight ? "bg-gray-100/90" : "bg-gray-700/60",
    badgeBorder: isLight ? "border-gray-200" : "border-gray-600/60",
    btnBorder: isLight ? "border-gray-300" : "border-gray-700",
    btnBg: isLight ? "bg-gray-100/70 hover:bg-gray-100" : "bg-gray-700/30 hover:bg-gray-700/50",
    btnText: isLight ? "text-gray-800" : "text-gray-200",
    roleGrad: isLight ? "from-gray-300/40 to-gray-200/30" : "from-gray-500/30 to-gray-600/30",
    utilGrad: isLight ? "from-gray-200/40 to-gray-300/30" : "from-gray-600/20 to-gray-700/20",
    auroraStops: isLight ? ["#CBD5E1", "#A0AEC0", "#94A3B8"] : ["#A0AEC0", "#718096", "#4A5568"],
    blobA: isLight ? "bg-gradient-to-br from-gray-300/30 via-gray-200/25 to-gray-100/20" : "bg-gradient-to-br from-gray-500/20 via-gray-600/15 to-gray-700/10",
    blobB: isLight ? "bg-gradient-to-br from-gray-300/30 via-gray-200/25 to-gray-100/20" : "bg-gradient-to-br from-gray-500/20 via-gray-600/15 to-gray-700/10",
    grains: isLight ? "bg-[radial-gradient(1000px_500px_at_50%_-20%,rgba(0,0,0,0.05),transparent_70%),radial-gradient(900px_600px_at_50%_120%,rgba(0,0,0,0.05),transparent_70%)]" : "bg-[radial-gradient(1000px_500px_at_50%_-20%,rgba(255,255,255,0.05),transparent_70%),radial-gradient(900px_600px_at_50%_120%,rgba(255,255,255,0.05),transparent_70%)]",
  };

  const cardVariants = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } } };
  const headerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.5, ease: "easeOut" } } };
  const utilsVariants = { hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } } };

  return (
    <>
      <AnimatePresence>
        {showIntro && (
          <motion.div className={`fixed inset-0 z-[999] flex items-center justify-center ${pal.pageBg}`} exit={{ y: "-100%" }} transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}>
             <motion.div exit={{ scale: 0.9, opacity: 0 }} transition={{ duration: 0.5 }}><SynergyLoader /></motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div data-theme={`rolehub ${theme}`} className={`relative min-h-screen overflow-hidden ${pal.pageBg} flex items-center justify-center px-6 py-14 font-['Inter',-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]`}>
         {effectsEnabled && (
          <>
            <div aria-hidden className="absolute inset-0 z-0 pointer-events-none" style={{ opacity: isLight ? 0.25 : 0.15 }}><Aurora colorStops={pal.auroraStops} amplitude={1.0} blend={0.1} speed={0.6} /></div>
            <style>{`@keyframes floatSlow { 0%{transform:translate3d(-5%,-3%,0)} 50%{transform:translate3d(5%,3%,0)} 100%{transform:translate3d(-5%,-3%,0)} } @keyframes drift { 0%{transform:translate3d(4%,-4%,0)} 50%{transform:translate3d(-4%,4%,0)} 100%{transform:translate3d(4%,-4%,0)} }`}</style>
            <div aria-hidden className={`pointer-events-none absolute -top-1/3 -left-1/4 w-[60rem] h-[60rem] rounded-full ${pal.blobA} blur-[100px] z-[1]`} style={{ animation: "floatSlow 20s ease-in-out infinite" }} />
            <div aria-hidden className={`pointer-events-none absolute -bottom-1/3 -right-1/4 w-[60rem] h-[60rem] rounded-full ${pal.blobB} blur-[100px] z-[1]`} style={{ animation: "drift 24s ease-in-out infinite" }} />
            <div aria-hidden className={`pointer-events-none absolute inset-0 ${pal.grains} z-[1]`} />
          </>
        )}

        <div className="relative z-10 w-full max-w-[1280px]">
          <div className="absolute top-[-30px] right-0 flex items-center gap-4">
            <motion.button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} className={`flex items-center gap-2 text-xs font-medium ${isLight ? "text-gray-700 hover:text-gray-900" : "text-gray-400 hover:text-gray-200"}`} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}{isLight ? "Dark Mode" : "Light Mode"}
            </motion.button>
            <motion.button onClick={() => setEffectsEnabled((e) => !e)} className={`flex items-center gap-2 text-xs font-medium ${isLight ? "text-gray-700 hover:text-gray-900" : "text-gray-400 hover:text-gray-200"}`} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Zap className={`h-4 w-4 ${effectsEnabled ? (isLight ? "text-gray-800" : "text-gray-300") : (isLight ? "text-gray-400" : "text-gray-500")}`} />{effectsEnabled ? "Disable Effects" : "Enable Effects"}
            </motion.button>
          </div>
          <header className="mb-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <img src="/images/hub.png" alt="Company Logo" className="h-11 w-11" />
              <motion.h1 className={`text-xl font-medium ${pal.textMain} tracking-tight`} variants={headerVariants} initial="hidden" animate="visible" style={{ textShadow: isLight ? "none" : "0 0 4px rgba(255,255,255,0.1)" }}>Synergy Tools</motion.h1>
            </div>
            <motion.p className={`mt-2 text-xs ${pal.textMuted} max-w-sm mx-auto`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.4 }}>Select a workspace or utility to proceed.</motion.p>
          </header>
          {session && (
            <div className={`mb-6 mx-auto max-w-[780px] rounded-lg border ${pal.stripBorder} ${pal.stripBg} p-3 text-xs ${pal.textMuted} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                {session.roles?.map(r => <span key={r} className={`px-2 py-0.5 rounded-md ${pal.badgeBg} ${pal.badgeBorder} border text-[10px] uppercase tracking-wide ${isLight ? "text-gray-700" : "text-gray-300"}`}>{r}</span>) || <span className={`px-2 py-0.5 rounded-md ${pal.badgeBg} ${pal.badgeBorder} border text-[10px] uppercase tracking-wide ${isLight ? "text-gray-700" : "text-gray-300"}`}>{session.role?.toUpperCase()}</span>}
                <span className="truncate">{isLight ? "Signed in as" : "Signed in as"} <span className={`${isLight ? "text-gray-900" : "text-white"} font-medium`}>{session.name}</span></span>
                {userRoles.includes("manager") && !token && <span className={`${isLight ? "text-amber-700/90" : "text-amber-300/90"} ml-2`}>(password required for Manager)</span>}
              </div>
              <div className="flex items-center gap-2"><button onClick={signOut} className={`h-7 rounded-md px-3 border ${pal.btnBorder} ${isLight ? "bg-white/60 hover:bg-white" : "bg-transparent hover:bg-gray-800/80"} ${isLight ? "text-gray-700" : "text-gray-300"} transition`}>Sign out</button></div>
            </div>
          )}
          <div className="flex flex-col items-center gap-6 md:flex-row md:justify-center md:gap-4">
            <motion.div variants={cardVariants} initial="hidden" animate="visible">
              <WebRoleCard theme={theme} title="Tester" body="Run device checks, log results, and move units forward." gradient={pal.roleGrad} onClick={() => (active.tester ? continueTo("tester") : gotoLogin("tester"))} Icon={ClipboardCheck} ctaLabel="Enter Tester Login" badgeText={active.tester ? "Active" : undefined} />
            </motion.div>
            <motion.div variants={cardVariants} initial="hidden" animate="visible" transition={{ delay: 0.1 }}>
              <WebRoleCard theme={theme} title="Poster" body="Create listings, update pricing, and publish inventory." gradient={pal.roleGrad} onClick={() => (active.poster ? continueTo("poster") : gotoLogin("poster"))} Icon={Megaphone} ctaLabel="Enter Poster Login" badgeText={active.poster ? "Active" : undefined} />
            </motion.div>
            <motion.div variants={cardVariants} initial="hidden" animate="visible" transition={{ delay: 0.2 }}>
              <WebRoleCard theme={theme} title="Manager" body="Coordinate teams, approve changes, and monitor operations." gradient={pal.roleGrad} onClick={() => (active.manager ? continueTo("manager") : gotoLogin("manager"))} Icon={UserCog} ctaLabel="Enter Manager Login" badgeText={active.manager ? "Active" : "Locked"} />
            </motion.div>
          </div>
          <motion.div className="mt-10" variants={utilsVariants} initial="hidden" animate="visible">
            <h2 className={`text-base font-medium ${pal.textMain} text-center mb-4 tracking-tight`}>Utilities</h2>
            <div className="flex justify-center"><WebUtilitiesCard theme={theme} title="System Tools" body="Diagnostics & Tools" gradient={pal.utilGrad} onClick={() => nav("/utilities")} Icon={Wrench} /></div>
          </motion.div>
          <p className={`mt-10 text-center text-xs ${pal.textMuted}`}>Need assistance? Contact an administrator for support.</p>
        </div>
      </div>
    </>
  );
}

// WEB MODE SUB-COMPONENTS
function WebRoleCard({ theme, title, body, onClick, gradient, Icon, ctaLabel, badgeText }: any) {
  const isLight = theme === "light";
  const pal = { containerBg: isLight ? "bg-white/70" : "bg-gray-800/50", border: isLight ? "border-gray-200" : "border-gray-700", title: isLight ? "text-gray-900" : "text-white", body: isLight ? "text-gray-700" : "text-gray-300", iconWrap: isLight ? "bg-gray-100 p-2.5" : "bg-gray-700/50 p-2.5", buttonBorder: isLight ? "border-gray-300" : "border-gray-600", buttonBg: isLight ? "bg-gray-100/70" : "bg-gray-700/30", buttonText: isLight ? "text-gray-800" : "text-gray-200" };
  return (
    <motion.div className={`relative w-[380px] min-h-[240px] overflow-hidden rounded-xl border ${pal.border} ${pal.containerBg} backdrop-blur-xl shadow-xl`} whileHover={{ y: -2 }}>
      <div className={`absolute -inset-20 bg-gradient-to-br ${gradient} blur-2xl opacity-40`} />
      <div className="relative p-6">
        <div className="mb-4 flex items-center gap-3"><div className={`rounded-lg ${pal.iconWrap}`}><Icon size={24} className={pal.title}/></div><h3 className={`text-lg font-medium ${pal.title}`}>{title}</h3></div>
        <p className="min-h-[60px] text-sm text-gray-500">{body}</p>
      </div>
      <div className="relative px-6 pb-6"><button onClick={onClick} className={`w-full h-10 rounded-lg border ${pal.buttonBorder} ${pal.buttonBg} ${pal.buttonText} text-sm font-medium`}>{ctaLabel}</button></div>
    </motion.div>
  );
}

function WebUtilitiesCard({ theme, title, body, onClick, gradient, Icon }: any) {
    const isLight = theme === "light";
    const pal = { containerBg: isLight ? "bg-white/60" : "bg-gray-800/40", border: isLight ? "border-gray-200" : "border-gray-700", title: isLight ? "text-gray-900" : "text-white" };
    return (
      <motion.div className={`relative w-[380px] min-h-[180px] overflow-hidden rounded-xl border ${pal.border} ${pal.containerBg} backdrop-blur-xl shadow-lg`} whileHover={{ y: -2 }}>
        <div className={`absolute -inset-16 bg-gradient-to-br ${gradient} blur-2xl opacity-40`} />
        <div className="relative p-5"><div className="mb-3 flex items-center gap-2.5"><Icon className={`h-5 w-5 ${pal.title}`} /><h3 className={`text-base font-medium ${pal.title}`}>{title}</h3></div><p className="text-xs text-gray-500">{body}</p></div>
        <div className="relative px-5 pb-5"><button onClick={onClick} className="w-full h-9 rounded-lg border border-gray-500/20 bg-white/10 text-xs">Open</button></div>
      </motion.div>
    );
}