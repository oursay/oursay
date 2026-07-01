import type { ReactNode } from "react";

interface ScrollBodyProps {
  children: ReactNode;
  className?: string;
}

/** The scrollable content region between the header and the safe footer. */
export function ScrollBody({ children, className = "" }: ScrollBodyProps) {
  return (
    <div className={`flex-1 overflow-y-auto ${className}`}>{children}</div>
  );
}
