"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "expense-tracker:theme";
/** Browser UI colour per theme; matches --background (see app/layout.tsx). */
export const THEME_COLORS = { light: "#f6f8f9", dark: "#0d1518" } as const;
const EVENT = "expense-tracker:theme-change";

/**
 * Runs in <head> before first paint so the saved theme never flashes.
 * Must stay dependency-free; it is inlined as a string.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)})||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";if(t!=="system")document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",d?${JSON.stringify(
  THEME_COLORS.dark,
)}:${JSON.stringify(THEME_COLORS.light)})})}catch(_){}})()`;

function readTheme(): Theme {
  try {
    const t = window.localStorage.getItem(STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

const systemQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function resolve(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return systemQuery().matches ? "dark" : "light";
}

function apply(theme: Theme) {
  const resolved = resolve(theme);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  // Phone browser chrome follows the chosen theme, not just the system one.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const media = m.getAttribute("media");
    const own = media?.includes("dark") ? THEME_COLORS.dark : THEME_COLORS.light;
    m.setAttribute("content", theme === "system" ? own : THEME_COLORS[resolved]);
  });
}

/** Re-applies the saved theme; the head script may run before the meta tags exist. */
export function syncTheme() {
  apply(readTheme());
}

function subscribe(onChange: () => void) {
  const mq = systemQuery();
  const onSystem = () => {
    if (readTheme() === "system") apply("system");
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  mq.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
    mq.removeEventListener("change", onSystem);
  };
}

const getSnapshot = () => `${readTheme()}:${resolve(readTheme())}`;
const getServerSnapshot = () => "system:light";

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [theme, resolvedTheme] = snapshot.split(":") as [Theme, "light" | "dark"];

  const setTheme = useCallback((next: Theme) => {
    try {
      if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable: still apply for this session */
    }
    apply(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { theme, resolvedTheme, setTheme };
}
