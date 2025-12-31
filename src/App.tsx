// App.tsx

// --- MODIFICATION: Cleaned up duplicate imports ---
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FaviconSwitcher from "./components/FaviconSwitcher";
import TitleSwitcher from "./components/TitleSwitcher";
import { GlobalEventListener } from "@/components/GlobalEventListener"; // Keep this import

import {
  BrowserRouter,
  Routes,
  Route,
  Outlet,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";

// Pages
import TesterDashboard from "./pages/TesterDashboard";
import ManagerDashboard from "./pages/ManagerDashboard";
import TesterAuthPage from "./pages/TesterAuthPage";
import PosterAuthPage from "./pages/PosterAuthPage";
import ManagerAuthPage from "./pages/ManagerAuthPage"; // Manager replaces Admin
import RoleAuthHub from "./pages/RoleAuthHub";
import NotFound from "./pages/NotFound";
import Index from "./pages/Index";            // Posters workbench
import TimeCard from "./pages/TimeTracking"; // /gallery landing
import UtilitiesHub from "./pages/UtilitiesHub";
import MacbookPricer from "./pages/tools/MacbookPricer";
import InStorePricer from "./pages/tools/InStorePricer";
import LabelInventoryPage from "./pages/LabelInventoryPage";
import FrontCounterPOS from "./pages/FrontCounterPOS";
import PhotoGallery from "./pages/PhotoGallery";
import TodoPage from "./pages/TodoPage";
import LandingPage from "./pages/LandingPage";

/* -------------------- session helpers -------------------- */
/** Accept any of these keys as a valid token (Directus removed) */
function getAnyToken(): string | null {
  try {
    return (
      localStorage.getItem("synergy_auth_token") ||
      sessionStorage.getItem("synergy_auth_token") ||
      null
    );
  } catch {
    return null;
  }
}

/** Workbench treats this as "logged-in" */
function getSessionUser(): { id: string | number; name: string; role?: string } | null {
  try {
    const raw = localStorage.getItem("synergy_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Optional role getter used for strict route protection */
function getRole(): string | null {
  try {
    return localStorage.getItem("synergy_role");
  } catch {
    return null;
  }
}

/**
 * Guard:
 * - Pass if we have a token OR a synergy_user (either counts as logged-in UI session).
 * - If requireRole is specified, enforce it:
 *   - For manager, require both role === 'manager' AND a token.
 *   - For poster/tester, require the stored role to match.
 * - If missing, redirect to that role's login and remember where we came from.
 */
function RequireAuth({ requireRole }: { requireRole?: "poster" | "tester" | "manager" }) {
  const token = getAnyToken();
  const user = getSessionUser();
  const storedRole = (getRole() || user?.role || "").toLowerCase();
  const location = useLocation();

  // No session at all → send to a sensible login (poster by default)
  if (!token && !user) {
    const to =
      requireRole === "tester" ? "/login/testers" :
      requireRole === "poster" ? "/login/posters" :
      requireRole === "manager" ? "/login/manager" :
      "/login/posters";
    return <Navigate to={to} replace state={{ from: location.pathname + location.search }} />;
  }

  // Role enforcement
  if (requireRole) {
    if (requireRole === "manager") {
      if (storedRole !== "manager" || !token) {
        return <Navigate to="/login/manager" replace state={{ from: location.pathname + location.search }} />;
      }
    } else if (storedRole !== requireRole) {
      const to = requireRole === "tester" ? "/login/testers" : "/login/posters";
      return <Navigate to={to} replace state={{ from: location.pathname + location.search }} />;
    }
  }

  return <Outlet />;
}

/* -------------------- layout + wrappers -------------------- */

const queryClient = new QueryClient();

function RootLayout() {
  return <Outlet />;
}

/**
 * These wrappers catch the "from" location so we go back to where the user
 * originally wanted (e.g., /gallery/00001-0001) instead of always /poster.
 * They also persist minimal session info onAuth, including the role.
 */
function TesterLoginRoute() {
  const nav = useNavigate();
  const location = useLocation() as any;
  const from = location?.state?.from || "/tester";
  return (
    <TesterAuthPage
      onAuth={(u: { id: number; name: string; token?: string }) => {
        try {
          localStorage.setItem("synergy_user", JSON.stringify({ ...u, role: "tester" }));
          localStorage.setItem("synergy_role", "tester");
          if (u.token) localStorage.setItem("synergy_auth_token", u.token);
        } catch {}
        nav(from, { replace: true });
      }}
    />
  );
}

function PosterLoginRoute() {
  const nav = useNavigate();
  const location = useLocation() as any;
  
  // --- FIX: Intercept Logout Action Here ---
  const searchParams = new URLSearchParams(location.search);
  if (searchParams.get("action") === "logout") {
    console.log("⚡ [App] Processing Logout Action...");
    
    // Nuke all auth keys to prevent auto-login
    localStorage.removeItem("synergy_user");
    localStorage.removeItem("synergy_token");
    localStorage.removeItem("synergy_tester");
    localStorage.removeItem("synergy_admin");
    localStorage.removeItem("synergy_role");
  }
  // ----------------------------------------

  const from = location?.state?.from || "/poster";
  
  return (
    <PosterAuthPage
      onAuth={(u: { id: number; name: string; token?: string }) => {
        try {
          localStorage.setItem("synergy_user", JSON.stringify({ ...u, role: "poster" }));
          localStorage.setItem("synergy_role", "poster");
          if (u.token) localStorage.setItem("synergy_auth_token", u.token);
        } catch {}
        nav(from, { replace: true });
      }}
    />
  );
}

function ManagerLoginRoute() {
  const nav = useNavigate();
  const location = useLocation() as any;
  const from = location?.state?.from || "/manager";
  return (
    <ManagerAuthPage
      onAuth={(u: { id: number; name: string; token?: string }) => {
        try {
          // The user object from the database is the source of truth
          localStorage.setItem("synergy_user", JSON.stringify({ ...u, role: "manager" }));
          localStorage.setItem("synergy_role", "manager");
          localStorage.setItem("synergy_auth_token", u.token || `manager-session-${u.id}`);
          
        } catch {}
        nav(from, { replace: true });
      }}
    />
  );
}

/* -------------------- App -------------------- */

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      {/* Your existing Sonner component is untouched. */}
      <Sonner />

      <BrowserRouter>
        <FaviconSwitcher />
        <TitleSwitcher />
        <Routes>
          <Route path="/" element={<RootLayout />}>
            {/* DEFAULT → Role selection hub */}
            <Route index element={<RoleAuthHub />} />

            {/* Login flows */}
            <Route path="login" element={<RoleAuthHub />} />
            <Route path="login/testers" element={<TesterLoginRoute />} />
            <Route path="login/posters" element={<PosterLoginRoute />} />
            <Route path="login/manager" element={<ManagerLoginRoute />} />

            {/* Apps (role-protected) */}
            <Route element={<RequireAuth requireRole="poster" />}>
              <Route path="poster" element={<Index />} />
            </Route>
            <Route element={<RequireAuth requireRole="tester" />}>
              <Route path="tester" element={<TesterDashboard />} />
            </Route>
            <Route element={<RequireAuth requireRole="manager" />}>
              <Route path="manager" element={<ManagerDashboard />} />
            </Route>


            {/* UTILITIES SECTION */}
            <Route path="utilities" element={<UtilitiesHub />} />
            <Route path="utilities/macbook-pricer" element={<MacbookPricer />} />
            <Route path="utilities/in-store-pricer" element={<InStorePricer />} /> 

            <Route path="labelinventory" element={<LabelInventoryPage/>} />
            <Route path="frontcounter" element={<FrontCounterPOS/>} />
            <Route path="photogallery" element={<PhotoGallery/>} />


            <Route path="timecard" element={<TimeCard/>} />
            <Route path="todopage" element={<TodoPage user={undefined}/>} />
            <Route path="landing" element={<LandingPage/>} />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
      
      {/* --- MODIFICATION: Moved these components inside the main providers --- */}
      {/* This is the Toaster that our GlobalEventListener will use. */}
      <Toaster />
      {/* This is our new component that listens for backup events. */}
      <GlobalEventListener />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;