"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { swallowNextPointerClick } from "@/components/utils";

type Variant = "center" | "sheet";
type Size = "picker" | "compact" | "dialog" | "wide";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Replaces the default title/subtitle block (compose editor header). */
  header?: ReactNode;
  /** Accessible name when `header` is used instead of `title`. */
  ariaLabel?: string;
  /** center = small dialog card; sheet = tall near-full-height panel (register/profile). */
  variant?: Variant;
  /** picker ≈ 320px wireframe cards; dialog = full-width compose editor; wide for add-jurisdiction. */
  size?: Size;
  children: ReactNode;
  /** Optional label rendered under the title (e.g. register subtitle). */
  subtitle?: ReactNode;
  /** Picker modals center their header like the wireframe. */
  headerAlign?: "left" | "center";
  /** Full-bleed on mobile: pinned left with a small right gap for the close button; reverts to centered on ≥sm. */
  mobileFull?: boolean;
}

const SIZES: Record<Size, string> = {
  picker: "max-w-[20rem]",
  compact: "max-w-[17.5rem]",
  dialog: "max-w-md",
  wide: "max-w-[21.25rem]",
};

const SIZES_SM: Record<Size, string> = {
  picker: "sm:max-w-[20rem]",
  compact: "sm:max-w-[17.5rem]",
  dialog: "sm:max-w-md",
  wide: "sm:max-w-[21.25rem]",
};

/**
 * Presentational modal shell: dimmed backdrop + panel, Escape / outside release
 * to close. Portaled to document.body so dismiss never leaks clicks to the page.
 */
export function Modal({
  open,
  onClose,
  title,
  header,
  ariaLabel,
  variant = "center",
  size = "picker",
  subtitle,
  headerAlign = "left",
  mobileFull = false,
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

  const isSheet = variant === "sheet";

  const panel = isSheet
    ? `mt-6 mb-6 max-h-[calc(100dvh-3rem)] ${
        mobileFull
          ? "w-full sm:mx-auto sm:w-[calc(100%-2rem)] sm:max-w-md"
          : "mx-auto w-[calc(100%-2rem)] max-w-md"
      }`
    : `my-auto ${
        mobileFull
          ? `w-full sm:mx-auto sm:w-[calc(100%-2rem)] ${SIZES_SM[size]}`
          : `mx-auto w-[calc(100%-2rem)] ${SIZES[size]}`
      }`;

  const vertical = isSheet ? "items-start pt-6 pb-4" : "items-center py-4";
  const horizontal = mobileFull
    ? "justify-start pl-0.5 pr-3.5 sm:justify-center sm:px-4"
    : "justify-center px-4";

  const centered = headerAlign === "center";

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex overflow-y-auto bg-black/45 ${vertical} ${horizontal}`}
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
        aria-label={ariaLabel ?? title}
        className={`pill-chrome relative flex flex-col overflow-visible rounded-2xl bg-surface px-5 pb-4 pt-5 ${panel}`}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {header ? (
          <div className="mb-4 w-full shrink-0">{header}</div>
        ) : title ? (
          <div
            className={`mb-4 shrink-0 ${centered ? "px-6 pt-0.5 text-center" : "pr-4"}`}
          >
            <h2 className="text-lg font-bold leading-snug text-ink">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-muted">{subtitle}</p>
            ) : null}
          </div>
        ) : null}
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute -right-3 -top-3 z-10 inline-flex size-[26px] items-center justify-center rounded-full bg-ink text-paper shadow-sm hover:bg-ink-soft"
        >
          <X size={14} aria-hidden />
        </button>
        {/* -mx-5 + px-5 lets the scroll gutter sit in the panel's padding at the
            edge, while the content keeps the same inset as the header. */}
        <div className="-mx-5 min-h-0 min-w-0 flex-1 overflow-y-auto px-5">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
