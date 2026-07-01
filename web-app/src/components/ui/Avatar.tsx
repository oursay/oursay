import { initials } from "@/components/utils";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "size-6 text-[9px]",
  md: "size-9 text-[11px]",
  lg: "size-13 text-sm",
};

interface AvatarProps {
  name: string;
  size?: Size;
  className?: string;
}

/** Initials-in-a-circle avatar (the wireframe has no real avatar images). */
export function Avatar({ name, size = "md", className = "" }: AvatarProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-300 font-semibold text-brand-900 ${SIZES[size]} ${className}`}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
