"use client";

import type { ReactNode } from "react";
import { swallowNextPointerClick } from "@/components/utils";

interface AppFrameProps {
  header: ReactNode;
  footer?: ReactNode;
  fab?: ReactNode;
  children: ReactNode;
  /** Transparent capture layer for header popovers (filter / jurisdiction). */
  captureActive?: boolean;
  onCaptureDismiss?: () => void;
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
  captureActive = false,
  onCaptureDismiss,
}: AppFrameProps) {
  return (
    <div className="fixed inset-0 flex justify-center bg-paper">
      <div className="relative h-dvh max-h-dvh w-full max-w-md overflow-hidden">
        <div className="h-full min-h-0 overflow-y-auto overscroll-contain pt-14 pb-24">
          {children}
        </div>
        {captureActive && onCaptureDismiss ? (
          <div
            className="absolute inset-0 z-20"
            aria-hidden
            onPointerUp={(e) => {
              if (e.target === e.currentTarget) {
                e.preventDefault();
                e.stopPropagation();
                swallowNextPointerClick();
                onCaptureDismiss();
              }
            }}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
          <div className="pointer-events-auto">{header}</div>
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
