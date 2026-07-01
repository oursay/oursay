"use client";

import type { ReactNode } from "react";

interface AppFrameProps {
  header: ReactNode;
  footer?: ReactNode;
  fab?: ReactNode;
  children: ReactNode;
}

/**
 * Fixed mobile viewport shell — matches the wireframe's phone frame.
 * Chrome (header, FAB) stays put; only the body scrolls. Prevents page-level
 * scroll and mobile keyboard/viewport resize from disrupting the layout.
 */
export function AppFrame({ header, footer, fab, children }: AppFrameProps) {
  return (
    <div className="fixed inset-0 flex justify-center bg-paper">
      <div className="relative flex h-dvh max-h-dvh w-full max-w-md flex-col overflow-hidden">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
        {footer}
        {fab}
      </div>
    </div>
  );
}
