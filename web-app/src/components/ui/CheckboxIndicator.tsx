import { CircleCheckBig } from "lucide-react";

interface CheckboxIndicatorProps {
  checked: boolean;
  size?: number;
  className?: string;
}

/** Same icon both states — unchecked hides the check path so the ring stays aligned. */
export function CheckboxIndicator({
  checked,
  size = 20,
  className = "",
}: CheckboxIndicatorProps) {
  return (
    <CircleCheckBig
      size={size}
      aria-hidden
      className={`shrink-0 [&>path:nth-child(2)]:[stroke-width:3] ${
        checked
          ? "text-ink [&>path:nth-child(2)]:stroke-brand-600"
          : "text-muted [&>path:nth-child(2)]:stroke-transparent"
      } ${className}`.trim()}
    />
  );
}
