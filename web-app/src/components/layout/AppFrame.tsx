"use client";

import type { ReactNode } from "react";

interface AppFrameProps {
  header: ReactNode;
  footer?: ReactNode;
  fab?: ReactNode;
  children: ReactNode;
  /** In-shell dismiss capture for header popovers (sits below header chrome). */
  dismissCapture?: ReactNode;
}

/**
 * Fixed mobile viewport shell — chrome overlays the scroll body so header/footer
 * fades stay transparent over feed content.
 */
export function AppFrame({
  header,
  footer,
  fab,
  children,
  dismissCapture,
}: AppFrameProps) {
  return (
    <div className="fixed inset-0 flex justify-center bg-paper">
      <div className="relative h-dvh max-h-dvh w-full max-w-md overflow-hidden">
        {dismissCapture}
        <div className="h-full min-h-0 overflow-y-auto overscroll-contain pt-14 pb-24">
          {children}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40">
          {header}
        </div>
        {footer ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
            {footer}
          </div>
        ) : null}
        {fab}
      </div>
    </div>
  );
}
