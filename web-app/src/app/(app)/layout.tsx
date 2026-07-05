"use client";

import type { ReactNode } from "react";
import { AppProvider } from "@/lib/state";
import { AppShell } from "@/views/AppShell";

/** Client shell for the five civic views: shared chrome + app state provider. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
