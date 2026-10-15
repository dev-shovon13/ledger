"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { useAppReady, useDataStore } from "@/lib/store";

/**
 * Data lives in the browser, so a page can only show it after mount. Each
 * page renders this gate itself (rather than the layout withholding
 * `children`), so the route segment always renders on the server and
 * Next.js can validate its navigation.
 */
export function ReadyGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const ready = useAppReady();
  const status = useDataStore((s) => s.status);
  const error = useDataStore((s) => s.error);

  if (ready) return children;

  if (status === "error") {
    return (
      <div role="alert" className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="font-medium">{t.shell.loadFailed}</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" onClick={() => void useDataStore.getState().load()}>
          {t.common.tryAgain}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="grid gap-6 lg:grid-cols-[12rem_1fr_18rem] xl:grid-cols-[14rem_1fr_20rem]"
      aria-busy="true"
      aria-label={t.common.loading}
    >
      <Skeleton className="hidden h-72 lg:block" />
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="hidden h-72 lg:block" />
    </div>
  );
}
