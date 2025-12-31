// src/utils/logout.ts
/**
 * Removes known auth keys and sends user to a login route.
 * Works in any React app (Vite, CRA, Next.js, etc.) since it falls back to window.location.
 */

type LoginPath = "/login" | "/login/posters" | "/login/testers" | "/login/admin";

/** Put any localStorage keys you use for auth here */
const KNOWN_AUTH_KEYS = [
  "synergy_user",
  "synergy_tester",
  "synergy_admin",
  // add any others you use, e.g. tokens, cached roles, etc.
] as const;

function removeKnownAuthKeys() {
  try {
    // remove explicit known keys
    for (const k of KNOWN_AUTH_KEYS) localStorage.removeItem(k);

    // optional: nuke any keys that start with a predictable prefix
    // (safeguard if some pages wrote different keys)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith("synergy_") || key.startsWith("auth_")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore quota / privacy errors
  }
}

/**
 * Hard navigates to the given login path after clearing auth.
 * Use this when you want a guaranteed redirect (even if the SPA router is in a weird state).
 */
export function logoutTo(path: LoginPath = "/login") {
  removeKnownAuthKeys();

  // Prefer a full reload to clear in-memory app state
  window.location.assign(path);
}

/**
 * If you’re in a Next.js App Router page and want a soft client route,
 * you can use this variant by passing a navigate/replace function:
 */
// Example signature if you want it:
export function logoutToWith(navigate: (p: string) => void, path: LoginPath = "/login") {
  removeKnownAuthKeys();
  // SPA navigation (React Router/Next router)
  navigate(path);
}
