import { avatarDataUri, DEFAULT_USER_ICON_TYPE } from "@/lib/avatar";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "size-6",
  md: "size-9",
  lg: "size-13",
};

interface AvatarProps {
  /** Display name (used as the avatar seed when no explicit seed is given). */
  name: string;
  /**
   * Identity-stable seed: the real handle for revealed accounts, the persona
   * name for anonymized authors. Falls back to `name`.
   */
  seed?: string;
  /** DiceBear style id (user allowlist, initial-face, or disco). Defaults to bottts-neutral. */
  iconType?: string | null;
  size?: Size;
  className?: string;
}

/** Deterministic generated avatar (DiceBear, offline data URI). */
export function Avatar({
  name,
  seed,
  iconType = DEFAULT_USER_ICON_TYPE,
  size = "md",
  className = "",
}: AvatarProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-300 ${SIZES[size]} ${className}`}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static data URI */}
      <img src={avatarDataUri(seed ?? name, iconType)} alt="" className="size-full" />
    </span>
  );
}
