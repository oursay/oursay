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
  /** Portal to document.body (modals). Inline for in-shell popover capture. */
  portaled?: boolean;
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
  portaled = true,
}: DismissBackdropProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  const layer = (
    <div
      className={`${portaled ? "fixed" : "absolute"} inset-0 ${dimmed ? "bg-black/45" : ""}`}
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
    />
  );

  return portaled ? createPortal(layer, document.body) : layer;
}
