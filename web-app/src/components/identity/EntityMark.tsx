"use client";

import { useState, type CSSProperties } from "react";
import {
  CodeXml,
  Fingerprint,
  Gavel,
  Globe,
  IdCard,
  IdCardLanyard,
  Key,
  MapPin,
  MapPinCheck,
  MapPinHouse,
  MapPinned,
  NotebookPen,
  ScanFace,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type { PillDisplayMode } from "@/lib/types";

/** Mark hue family — CSS owns one anchor + mix target per hue; shade is mixed at render. */
export type MarkHue = "signing" | "platform" | "kyc" | "media" | "official";

/**
 * Shade within a hue (1 furthest from anchor → 10 = full anchor).
 * Mix target is `--color-mark-*-mix` (white in light mode; Official → black
 * in dark so inverted chips darken). No per-shade CSS tokens.
 */
export type MarkShade = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

type MarkVisual = {
  icon: LucideIcon;
  label: string;
  shade: MarkShade;
};

type MarkSubtypeEntry = MarkVisual & {
  contexts?: Record<string, MarkVisual>;
};

/**
 * Taxonomy → visual defaults. Hue is per type; subtype/context only override
 * icon, label, and shade (never hue).
 *
 * Identity `issuerJurisdiction` (future): Didit (or similar) may return the ID
 * issuer jurisdiction (e.g. Alberta driver's licence). On a jurisdiction-wide
 * post (not a district/riding), that author can be treated as in-scope /
 * "affected" for the post — parallel to residency geo, but keyed off issuer,
 * not home district.
 */
const MARK_REGISTRY = {
  signing: {
    hue: "signing" as const satisfies MarkHue,
    subtypes: {
      /** Subtype label matches sign-tier strength (Passkey / Fingerprint / Face). */
      passkey: {
        icon: Key,
        label: "Passkey",
        /** Mid–deep honey; face/fingerprint step up, shade 10 still free. */
        shade: 7,
      } satisfies MarkSubtypeEntry,
      fingerprint: {
        icon: Fingerprint,
        label: "Fingerprint",
        shade: 8,
      } satisfies MarkSubtypeEntry,
      face: {
        icon: ScanFace,
        label: "Face",
        shade: 9,
      } satisfies MarkSubtypeEntry,
    },
  },
  platform: {
    hue: "platform" as const satisfies MarkHue,
    subtypes: {
      moderator: {
        icon: ShieldAlert,
        label: "Mod",
        shade: 1,
      } satisfies MarkSubtypeEntry,
      developer: {
        icon: CodeXml,
        label: "Dev",
        shade: 5,
      } satisfies MarkSubtypeEntry,
      admin: {
        icon: Globe,
        label: "Admin",
        shade: 10,
      } satisfies MarkSubtypeEntry,
    },
  },
  kyc: {
    hue: "kyc" as const satisfies MarkHue,
    subtypes: {
      identity: {
        icon: IdCard,
        label: "Identity",
        shade: 1,
        contexts: {
          /**
           * ID issuer matches the post's jurisdiction (e.g. Alberta DL on an
           * Alberta-wide post). Not district/riding scoped.
           */
          issuerJurisdiction: {
            icon: IdCard,
            label: "Affected",
            shade: 3,
          },
        },
      } satisfies MarkSubtypeEntry,
      residency: {
        icon: MapPin,
        label: "Residency",
        /** Spread across 3→10 so geo steps (esp. affected→myDistrict) read clearly. */
        shade: 3,
        contexts: {
          jurisdiction: {
            icon: MapPinned,
            label: "Jurisdiction",
            shade: 5,
          },
          affected: {
            icon: MapPinCheck,
            label: "Affected",
            shade: 7,
          },
          myDistrict: {
            icon: MapPinHouse,
            label: "MyDistrict",
            shade: 10,
          },
        },
      } satisfies MarkSubtypeEntry,
    },
  },
  media: {
    hue: "media" as const satisfies MarkHue,
    subtypes: {
      journalist: {
        icon: NotebookPen,
        label: "Journalist",
        shade: 5,
        contexts: {
          recognized: {
            icon: IdCardLanyard,
            label: "Journalist",
            shade: 10,
          },
        },
      } satisfies MarkSubtypeEntry,
    },
  },
  official: {
    hue: "official" as const satisfies MarkHue,
    subtypes: {
      official: {
        icon: Gavel,
        label: "Official",
        shade: 10,
        // Future contexts: jurisdiction rank/title → shade + label
        // (e.g. MLA, minister, premier) without changing hue.
      } satisfies MarkSubtypeEntry,
    },
  },
} as const;

export type EntityMarkType = keyof typeof MARK_REGISTRY;

/** Discriminated mark identity — higher components choose `mode`. */
export type EntityMarkSpec =
  | {
      type: "signing";
      subtype: "passkey" | "fingerprint" | "face";
      context?: never;
    }
  | {
      type: "platform";
      subtype: "moderator" | "developer" | "admin";
      context?: never;
    }
  | {
      type: "kyc";
      subtype: "identity";
      /** ID issuer jurisdiction matches the (jurisdiction-wide) post. */
      context?: never;
    }
  | {
      type: "kyc";
      subtype: "residency";
      context?: "jurisdiction" | "affected" | "myDistrict";
    }
  | {
      type: "media";
      subtype: "journalist";
      context?: "recognized";
    }
  | { type: "official"; subtype: "official"; context?: never };

export type EntityMarkProps = EntityMarkSpec & {
  mode?: PillDisplayMode;
} & Omit<React.HTMLAttributes<HTMLElement>, "children">;

type EntityMarkBaseProps = {
  bgColor: string;
  fgColor: string;
  icon: React.ReactNode;
  label: string;
  mode: PillDisplayMode;
} & Omit<React.HTMLAttributes<HTMLElement>, "children">;

const FULL_CLASS =
  "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium leading-tight";

const ICON_CLASS =
  "group inline-flex h-4 min-w-4 shrink-0 items-center justify-center gap-0.5 rounded-full px-0 text-[10px] font-medium leading-tight transition-[padding] hover:px-1.5 data-[expanded]:px-1.5";

/**
 * Shared mark chrome — full = static pill; icon = expandable circle that
 * reveals the label on hover (pointer) or tap (touch).
 */
export function EntityMarkBase({
  bgColor,
  fgColor,
  icon,
  label,
  mode,
  className,
  style,
  ...rest
}: EntityMarkBaseProps) {
  const mergedStyle: CSSProperties = {
    backgroundColor: bgColor,
    ...style,
  };

  if (mode === "icon") {
    return (
      <ExpandableEntityMark
        bgColor={bgColor}
        fgColor={fgColor}
        icon={icon}
        label={label}
        className={className}
        style={style}
        {...rest}
      />
    );
  }

  return (
    <span
      className={`${FULL_CLASS} ${fgColor} ${className ?? ""}`}
      style={mergedStyle}
      {...rest}
    >
      {icon}
      {label}
    </span>
  );
}

/**
 * Icon-only mark that reveals its full label on hover (pointer) or tap
 * (touch). Full-form marks are static; only the icon variant expands.
 */
function ExpandableEntityMark({
  bgColor,
  fgColor,
  icon,
  label,
  className,
  style,
  onClick,
  onMouseLeave,
  onBlur,
  ...rest
}: Omit<EntityMarkBaseProps, "mode">) {
  const [expanded, setExpanded] = useState(false);

  const mergedStyle: CSSProperties = {
    backgroundColor: bgColor,
    ...style,
  };

  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      data-expanded={expanded || undefined}
      onClick={(e) => {
        // Keep the mark self-contained inside clickable cards.
        e.stopPropagation();
        setExpanded((v) => !v);
        onClick?.(e);
      }}
      onMouseLeave={(e) => {
        setExpanded(false);
        onMouseLeave?.(e);
      }}
      onBlur={(e) => {
        setExpanded(false);
        onBlur?.(e);
      }}
      className={`${ICON_CLASS} ${fgColor} ${className ?? ""}`}
      style={mergedStyle}
      {...rest}
    >
      {icon}
      <span className="hidden whitespace-nowrap group-hover:inline group-data-[expanded]:inline">
        {label}
      </span>
    </button>
  );
}

/**
 * Static per-hue CSS vars — required so Tailwind's content scanner keeps the
 * `@theme` tokens. A dynamic `var(--color-mark-${hue})` is invisible to the
 * scanner; Official was tree-shaken out of light `:root` while `html.dark`
 * still set the near-white override, so light mode got an invalid (white) bg.
 */
const MARK_ANCHOR: Record<MarkHue, string> = {
  signing: "var(--color-mark-signing)",
  platform: "var(--color-mark-platform)",
  kyc: "var(--color-mark-kyc)",
  media: "var(--color-mark-media)",
  official: "var(--color-mark-official)",
};

const MARK_MIX: Record<MarkHue, string> = {
  signing: "var(--color-mark-signing-mix)",
  platform: "var(--color-mark-platform-mix)",
  kyc: "var(--color-mark-kyc-mix)",
  media: "var(--color-mark-media-mix)",
  official: "var(--color-mark-official-mix)",
};

/**
 * Shade 10 = full hue anchor. Shades 1–9 mix toward `--color-mark-*-mix`
 * (white by default; Official uses black in dark mode so the inverted chip
 * darkens instead of bleaching). Shade 1 → 30% hue, shade 10 → 100%
 * (≈7.8pp per step) so geo ladders like residency→affected→myDistrict
 * stay visually distinct.
 */
function shadeToBg(hue: MarkHue, shade: MarkShade): string {
  const anchor = MARK_ANCHOR[hue];
  if (shade === 10) return anchor;
  const huePct = 30 + ((shade - 1) * 70) / 9;
  return `color-mix(in oklch, ${anchor} ${huePct.toFixed(2)}%, ${MARK_MIX[hue]})`;
}

/**
 * KYC label contrast barrier = base residency shade. Residency and lighter
 * (identity, …) use dark text; jurisdiction and above use white. Tracks the
 * registry so bumping residency shade moves the barrier with it.
 */
const KYC_DARK_TEXT_MAX_SHADE: MarkShade =
  MARK_REGISTRY.kyc.subtypes.residency.shade;

/**
 * Foreground from fill strength (shade), not theme. Pale tints need a fixed
 * dark (`text-mark-on-tint`) — `text-ink` flips in dark mode and washes out
 * on light pastel chips. Signing is always light on honey. KYC flips at the
 * residency shade (≤ dark, > white). Official uses `text-paper` so it tracks
 * the page when the chip inverts light↔dark.
 */
function shadeToFg(hue: MarkHue, shade: MarkShade): string {
  if (hue === "official") return "text-paper";
  if (hue === "signing") return "text-white";
  if (hue === "kyc") {
    return shade <= KYC_DARK_TEXT_MAX_SHADE
      ? "text-mark-on-tint"
      : "text-white";
  }
  return shade <= 3 ? "text-mark-on-tint" : "text-white";
}

function resolveMark(spec: EntityMarkSpec): {
  hue: MarkHue;
  icon: LucideIcon;
  label: string;
  shade: MarkShade;
} {
  const family = MARK_REGISTRY[spec.type];
  const subtype = family.subtypes[spec.subtype as keyof typeof family.subtypes] as MarkSubtypeEntry;
  const contextKey = "context" in spec ? spec.context : undefined;
  const ctx =
    contextKey && subtype.contexts
      ? subtype.contexts[contextKey]
      : undefined;

  return {
    hue: family.hue,
    icon: ctx?.icon ?? subtype.icon,
    label: ctx?.label ?? subtype.label,
    shade: ctx?.shade ?? subtype.shade,
  };
}

/**
 * Background CSS colour for a mark spec — shared with settings chrome
 * (e.g. ProfileModal) so tier pills stay on EntityMark tokens.
 */
export function entityMarkBackground(spec: EntityMarkSpec): string {
  const { hue, shade } = resolveMark(spec);
  return shadeToBg(hue, shade);
}

/**
 * Foreground utility class for a mark spec (theme-stable where required).
 */
export function entityMarkForeground(spec: EntityMarkSpec): string {
  const { hue, shade } = resolveMark(spec);
  return shadeToFg(hue, shade);
}

/**
 * Defined entity mark — pass type/subtype/(optional) context; visuals come
 * from the registry. `mode` is chosen by the parent (icon vs full).
 */
export function EntityMark({
  type,
  subtype,
  context,
  mode = "full",
  className,
  ...rest
}: EntityMarkProps) {
  const resolved = resolveMark({ type, subtype, context } as EntityMarkSpec);
  const Icon = resolved.icon;

  return (
    <EntityMarkBase
      bgColor={shadeToBg(resolved.hue, resolved.shade)}
      fgColor={shadeToFg(resolved.hue, resolved.shade)}
      icon={
        <Icon
          size={10}
          aria-hidden
          className={mode === "icon" ? "shrink-0" : undefined}
        />
      }
      label={resolved.label}
      mode={mode}
      className={className}
      {...rest}
    />
  );
}
