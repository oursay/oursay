"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { swallowNextPointerClick } from "@/components/utils";

type Variant = "center" | "sheet";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** center = small dialog card; sheet = tall near-full-height panel (register/profile). */
  variant?: Variant;
  children: ReactNode;
  /** Optional label rendered under the title (e.g. register subtitle). */
  subtitle?: string;
}

/**
 * Presentational modal shell: dimmed backdrop + panel, Escape / outside release
 * to close. Portaled to document.body so dismiss never leaks clicks to the page.
 */
export function Modal({
  open,
  onClose,
  title,
  variant = "center",
  subtitle,
  children,
}: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const panel =
    variant === "sheet"
      ? "mx-auto mt-6 mb-6 w-[calc(100%-2rem)] max-w-md"
      : "mx-auto my-auto w-[calc(100%-3rem)] max-w-sm";

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex overflow-y-auto bg-black/45 ${
        variant === "sheet" ? "items-start pt-6" : "items-center"
      } justify-center p-4`}
      onPointerUp={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
          swallowNextPointerClick();
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex flex-col rounded-2xl border border-border-strong bg-surface p-5 shadow-xl ${panel}`}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className="mb-3 pr-10">
            <h2 className="text-lg font-bold text-ink">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
            ) : null}
          </div>
        ) : null}
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-full bg-ink text-white hover:bg-ink-soft"
        >
          <X size={16} aria-hidden />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
