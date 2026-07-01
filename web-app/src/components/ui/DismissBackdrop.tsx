"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { swallowNextPointerClick } from "@/components/utils";

interface DismissBackdropProps {
  open: boolean;
  onDismiss: () => void;
  /** z-index for the capture layer (panel should sit above). */
  zIndex?: number;
  /** Optional dimming; popovers use a transparent capture layer. */
  dimmed?: boolean;
}

/**
 * Full-viewport pointer capture that dismisses on outside release without
 * letting the same gesture activate controls underneath.
 */
export function DismissBackdrop({
  open,
  onDismiss,
  zIndex = 35,
  dimmed = false,
}: DismissBackdropProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={dimmed ? "fixed inset-0 bg-black/45" : "fixed inset-0"}
      style={{ zIndex }}
      aria-hidden
      onPointerUp={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
          swallowNextPointerClick();
          onDismiss();
        }
      }}
    />,
    document.body,
  );
}
