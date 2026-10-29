import { useSyncExternalStore } from "react";
const subscribe = (fn: () => void) => { window.addEventListener("popstate", fn); return () => window.removeEventListener("popstate", fn); };
export function usePathname() { return useSyncExternalStore(subscribe, () => window.location.pathname); }
export function useSearchParams() { return new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)); }
function navigate(url: string, replace = false) { if (replace) history.replaceState(null, "", url); else history.pushState(null, "", url); window.dispatchEvent(new PopStateEvent("popstate")); }
const router = { push: (url: string) => navigate(url), replace: (url: string) => navigate(url, true), back: () => history.back() };
export const useRouter = () => router;
