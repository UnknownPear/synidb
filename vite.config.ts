import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function normPrefix(v: string | undefined, fallback: string) {
  const raw = (v ?? fallback).trim();
  const lead = raw.startsWith("/") ? raw : `/${raw}`;
  return lead.replace(/\/+$/, "");
}

function makeEbayTokenManager(env: Record<string, string>) {
  let accessToken = env.VITE_EBAY_OAUTH_TOKEN || env.EBAY_OAUTH_TOKEN || "";
  let expiresAt = 0;

  const refreshToken = env.EBAY_REFRESH_TOKEN || env.VITE_EBAY_REFRESH_TOKEN || "";
  const clientId = env.EBAY_CLIENT_ID || env.VITE_EBAY_CLIENT_ID || "";
  const clientSecret = env.EBAY_CLIENT_SECRET || env.VITE_EBAY_CLIENT_SECRET || "";
  const ENABLE_MI = (env.VITE_ENABLE_MI || "").trim() === "1";

  let userToken = accessToken || "";
  let userExp = expiresAt || 0;
  let appToken = "";
  let appExp = 0;

  const hasUserRefresh = !!(refreshToken && clientId && clientSecret);
  const hasAppCreds = !!(clientId && clientSecret);

  const USER_SCOPES = (
    env.EBAY_USER_SCOPES ||
    env.VITE_EBAY_USER_SCOPES ||
    "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.inventory.readonly"
  ).trim();

  const APP_SCOPE = "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights";

  async function fetchToken(grant: "refresh" | "client", scopeStr: string) {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const body = new URLSearchParams();
    body.append("grant_type", grant === "refresh" ? "refresh_token" : "client_credentials");
    if (grant === "refresh") body.append("refresh_token", refreshToken);
    body.append("scope", scopeStr);

    try {
      const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
        body: body.toString(),
      });
      const json: any = await res.json();
      if (!res.ok) {
        console.error("[eBay OAuth] Failed:", json);
        return null;
      }
      const ttl = Number(json.expires_in || 3600) * 1000;
      return { token: json.access_token as string, exp: Date.now() + ttl };
    } catch (e) {
      console.error("[eBay OAuth] Error:", e);
      return null;
    }
  }

  async function refreshUserIfNeeded(force = false) {
    const now = Date.now();
    if (!hasUserRefresh) return userToken;
    if (!force && userToken && now < userExp - 5 * 60_000) return userToken;
    const t = await fetchToken("refresh", USER_SCOPES);
    if (t) {
      userToken = t.token;
      userExp = t.exp;
      accessToken = userToken;
      expiresAt = userExp;
      console.log(`[eBay OAuth] Refreshed USER token (~${Math.round((userExp - now) / 60000)} min)`);
    }
    return userToken;
  }

  async function refreshAppIfNeeded(force = false) {
    const now = Date.now();
    if (!hasAppCreds) return appToken;
    if (!ENABLE_MI) return appToken;
    if (!force && appToken && now < appExp - 5 * 60_000) return appToken;
    const t = await fetchToken("client", APP_SCOPE);
    if (t) {
      appToken = t.token;
      appExp = t.exp;
      console.log(`[eBay OAuth] Fetched APP token (~${Math.round((appExp - now) / 60000)} min)`);
    }
    return appToken;
  }

  async function refreshIfNeeded(force = false) {
    await Promise.all([refreshUserIfNeeded(force), refreshAppIfNeeded(force)]);
    return userToken || appToken;
  }

  function getTokenForPathSync(path = ""): string {
    if (ENABLE_MI && /^\/?buy\/marketplace_insights\//i.test(path)) {
      return appToken || userToken;
    }
    return userToken || appToken;
  }

  function start() {
    if (!hasUserRefresh && !hasAppCreds) return;
    refreshUserIfNeeded(true);
    setInterval(() => refreshUserIfNeeded(false), 10 * 60_000).unref?.();
    if (ENABLE_MI) {
      refreshAppIfNeeded(true);
      setInterval(() => refreshAppIfNeeded(false), 10 * 60_000).unref?.();
    }
  }

  return { enabled: hasUserRefresh || hasAppCreds, start, getTokenForPathSync, refreshIfNeeded };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const DEV_PORT = Number(env.VITE_DEV_PORT || 8081);
  const BACKEND_TARGET = env.VITE_BACKEND_TARGET || "http://127.0.0.1:3000";
  const SCRAPER_TARGET = env.VITE_SCRAPER_TARGET || env.VITE_SCRAPER_URL || "http://127.0.0.1:3333";
  const DIRECTUS_TARGET = env.VITE_DIRECTUS_TARGET || env.VITE_DIRECTUS_BASE || "http://127.0.0.1:8055";

  const API_PREFIX = normPrefix(env.VITE_API_URL, "/backend");
  const EBAY_PREFIX = normPrefix(env.VITE_EBAY_PROXY_BASE, "/ebay");
  const EBAY_TARGET = "https://api.ebay.com";
  const EBAY_MARKETPLACE_ID = env.VITE_EBAY_MARKETPLACE_ID || "EBAY_US";
  
  const ebayTokenMgr = makeEbayTokenManager(env);

  const proxyConfig: any = {
    [EBAY_PREFIX]: {
      target: EBAY_TARGET,
      changeOrigin: true,
      secure: true,
      rewrite: (p: string) => p.replace(new RegExp(`^${EBAY_PREFIX.replace(/\//g, "\\/")}`), ""),
      configure(proxy: any) {
        if (ebayTokenMgr.enabled) ebayTokenMgr.start();
        proxy.on("proxyReq", (proxyReq: any, req: any) => {
          const token = ebayTokenMgr.getTokenForPathSync(req?.url || "");
          if (token) proxyReq.setHeader("Authorization", `Bearer ${token}`);
          proxyReq.setHeader("X-EBAY-C-MARKETPLACE-ID", EBAY_MARKETPLACE_ID);
          proxyReq.setHeader("Content-Type", "application/json");
        });
        proxy.on("error", (err: any) => console.error("[proxy][eBay] error:", err.message));
      },
    },

    "/api": {
      target: DIRECTUS_TARGET,
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/api/, ""),
    },

    // Main Backend Proxy
    [API_PREFIX]: {
      target: BACKEND_TARGET,
      changeOrigin: true,
      secure: false,
      rewrite: (p: string) => p.replace(new RegExp(`^${API_PREFIX}`), ""),
      configure(proxy: any) {
        // Logging is vital for debugging the tunnel
        proxy.on("proxyReq", (_req: any, req: any) => console.log(`[Proxy] ${req.method} ${req.url} -> ${BACKEND_TARGET}`));
        proxy.on("error", (err: any) => console.error(`[Proxy] Error: ${err.message}`));
      },
    },

    "/backend": {
      target: BACKEND_TARGET,
      changeOrigin: true,
      secure: false,
      rewrite: (p: string) => p.replace(/^\/backend/, ""),
    },
    
    "/imports": {
      target: BACKEND_TARGET,
      changeOrigin: true,
      secure: false,
    },
    "/prefix": { target: BACKEND_TARGET, changeOrigin: true, secure: false },
    "/health": { target: BACKEND_TARGET, changeOrigin: true, secure: false },

    "/scrape": { target: SCRAPER_TARGET, changeOrigin: true },
    "/cookie": { target: SCRAPER_TARGET, changeOrigin: true },
    "/warmup": { target: SCRAPER_TARGET, changeOrigin: true },
  };

  return {
    plugins: [
      react(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),

    server: {
      host: true,
      port: DEV_PORT,
      strictPort: true,
      // Fixes the "Blocked request" error for Cloudflare Tunnels
      allowedHosts: true, 
      proxy: proxyConfig,
    },

    preview: {
      host: true,
      port: DEV_PORT,
      strictPort: true,
      // Fixes the "Blocked request" error for Cloudflare Tunnels
      allowedHosts: true,
      proxy: proxyConfig,
    },

    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    define: { "process.env": {} },
  };
});