import type { CSSProperties } from "react";
import {
  CodeXml,
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
      passkey: {
        icon: Key,
        label: "Passkey",
        shade: 1,
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
        shade: 5,
        contexts: {
          /**
           * ID issuer matches the post's jurisdiction (e.g. Alberta DL on an
           * Alberta-wide post). Not district/riding scoped.
           */
          issuerJurisdiction: {
            icon: IdCard,
            label: "Affected",
            shade: 7,
          },
        },
      } satisfies MarkSubtypeEntry,
      residency: {
        icon: MapPin,
        label: "Residency",
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
            shade: 9,
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
  | { type: "signing"; subtype: "passkey"; context?: never }
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
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children">;

type EntityMarkBaseProps = {
  bgColor: string;
  fgColor: string;
  icon: React.ReactNode;
  label: string;
  mode: PillDisplayMode;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children">;

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

  return (
    <span
      aria-label={label}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium leading-tight ${fgColor} ${className ?? ""}`}
      style={mergedStyle}
      {...rest}
    >
      {icon}
      {mode === "full" ? label : null}
    </span>
  );
}

/**
 * Shade 10 = full hue anchor. Shades 1–9 mix toward `--color-mark-*-mix`
 * (white by default; Official uses black in dark mode so the inverted chip
 * darkens instead of bleaching). Shade 1 → ~50% hue, then ≈ +5.6% per step.
 */
function shadeToBg(hue: MarkHue, shade: MarkShade): string {
  const anchor = `var(--color-mark-${hue})`;
  if (shade === 10) return anchor;
  const huePct = 50 + ((shade - 1) * 50) / 9;
  return `color-mix(in oklch, ${anchor} ${huePct.toFixed(2)}%, var(--color-mark-${hue}-mix))`;
}

/**
 * Official always uses `text-paper` (same as VerificationPill): tracks the
 * inverse of the page so it stays legible when the official chip inverts.
 * Colour hues: pale mixes → ink; stronger fills → white.
 */
function shadeToFg(hue: MarkHue, shade: MarkShade): string {
  if (hue === "official") return "text-paper";
  return shade <= 3 ? "text-ink" : "text-white";
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
      icon={<Icon size={10} aria-hidden />}
      label={resolved.label}
      mode={mode}
      className={className}
      {...rest}
    />
  );
}
