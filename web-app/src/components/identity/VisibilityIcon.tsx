"use client";

import type { LucideIcon } from "lucide-react";
import { Gavel, MapPinHouse, VenetianMask } from "lucide-react";
import type { AuthorVisibility } from "@/lib/types";
import { VISIBILITY_LABEL } from "@/lib/types";

/**
 * Glyph for a thread/account visibility setting (docs/09 picker ladder).
 * Public has no icon; personas of others always use the mask via AuthorRow.
 */
export function visibilityIconFor(v: AuthorVisibility): LucideIcon | null {
  switch (v) {
    case "anonymous":
      return VenetianMask;
    case "all_officials":
    case "my_officials":
      return Gavel;
    case "my_district":
    case "my_jurisdiction":
      return MapPinHouse;
    case "public":
    case "id_verified":
      return null;
  }
}

interface VisibilityIconProps {
  visibility: AuthorVisibility;
  size?: number;
  className?: string;
  /** Decorative when a parent already labels the setting. */
  decorative?: boolean;
}

/** Renders the visibility glyph, or null for public (and other no-icon values). */
export function VisibilityIcon({
  visibility,
  size = 12,
  className = "shrink-0 text-muted",
  decorative = false,
}: VisibilityIconProps) {
  const Icon = visibilityIconFor(visibility);
  if (!Icon) return null;
  return (
    <Icon
      size={size}
      className={className}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : VISIBILITY_LABEL[visibility]}
    />
  );
}
