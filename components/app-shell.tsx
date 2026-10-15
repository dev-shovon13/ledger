"use client";

import { HandCoinsIcon, ReceiptTextIcon, SettingsIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageSwitch } from "@/components/language-switch";
import { MonthSwitcher } from "@/components/month-switcher";
import { SettingsDialog } from "@/components/settings-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { initApp, useAppReady } from "@/lib/store";
import { syncTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", key: "expenses", icon: ReceiptTextIcon },
  { href: "/loans", key: "loans", icon: HandCoinsIcon },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ready = useAppReady();

  useEffect(() => {
    initApp();
    syncTheme();
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={t.common.appName}
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <WalletIcon className="size-4" />
            </span>
            <span className="hidden sm:inline">{t.common.appName}</span>
          </Link>

          {/* Desktop navigation; phones use the bottom tab bar. */}
          <nav aria-label={t.nav.main} className="hidden rounded-lg bg-muted p-0.75 md:flex">
            {NAV.map(({ href, key, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive(href) && "bg-background text-foreground shadow-sm dark:bg-input/80",
                )}
              >
                <Icon className="size-4" />
                {t.nav[key]}
              </Link>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 justify-center md:justify-end">
            {ready ? <MonthSwitcher /> : <Skeleton className="h-8 w-40" />}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <LanguageSwitch />
            <ThemeToggle className="hidden sm:inline-flex" />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.nav.settings}
              onClick={() => setSettingsOpen(true)}
              disabled={!ready}
            >
              <SettingsIcon />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-40 sm:px-6 sm:pt-7 sm:pb-24 md:pb-12">
        {/* Always render the page; each page gates on client data via <ReadyGate>. */}
        {children}
      </main>

      {/* Phone tab bar: thumb-reachable, stays out of the way on desktop. */}
      <nav
        aria-label={t.nav.main}
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-2">
          {NAV.map(({ href, key, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors outline-none focus-visible:bg-muted",
                  active && "text-primary",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-8 top-0 h-0.5 rounded-b-full bg-primary transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <Icon className="size-5" />
                {t.nav[key]}
              </Link>
            );
          })}
        </div>
      </nav>

      {ready && <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />}
    </>
  );
}
