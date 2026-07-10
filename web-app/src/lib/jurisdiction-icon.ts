import { Globe, Landmark, Newspaper, type LucideIcon } from "lucide-react";
import { GLOBAL_ID } from "@/lib/types";

/** Lucide glyph for a jurisdiction id (Global vs provincial). */
export function jurisdictionIconForId(id: string): LucideIcon {
  return id === GLOBAL_ID ? Globe : Landmark;
}

/**
 * Icon for the header jurisdiction pill. `label` is display text (not a logic
 * key): the single-jurisdiction pill shows its glyph, aggregates show generic
 * glyphs.
 */
export function jurisdictionPillIcon(label: string): LucideIcon {
  if (label === "All Jurisdictions") return Newspaper;
  if (label === "None" || label.endsWith(" Jurisdictions")) return Globe;
  return label === "Global" ? Globe : Landmark;
}
