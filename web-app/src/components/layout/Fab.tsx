"use client";

import { SquareFeather } from "@/components/ui/SquareFeather";

interface FabProps {
  onClick?: () => void;
}

/** Primary floating action — the new-post button (square + quill). */
export function Fab({ onClick }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="New post"
      className="absolute bottom-5 right-5 z-40 inline-flex size-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 hover:bg-brand-700"
    >
      <SquareFeather size={26} strokeWidth={2} aria-hidden />
    </button>
  );
}
