import { Globe, Landmark, Newspaper, type LucideIcon } from "lucide-react";

/** Lucide glyph for a subscribed jurisdiction name (Global vs provincial). */
export function jurisdictionIconForName(name: string): LucideIcon {
  return name === "Global" ? Globe : Landmark;
}

/** Icon for the header jurisdiction pill — single jurisdiction shows its glyph. */
export function jurisdictionPillIcon(label: string): LucideIcon {
  if (label === "All Jurisdictions") return Newspaper;
  if (label === "None" || label.endsWith(" Jurisdictions")) return Globe;
  return jurisdictionIconForName(label);
}
