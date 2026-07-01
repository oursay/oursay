"use client";

import { Home, Plus } from "lucide-react";

interface FabProps {
  /** compose = the Feed's "new post" (＋); home = the "go to feed" affordance elsewhere. */
  variant: "compose" | "home";
  onClick?: () => void;
}

/** Primary floating action button — the single primary action, brand-filled. */
export function Fab({ variant, onClick }: FabProps) {
  const isCompose = variant === "compose";
  const Icon = isCompose ? Plus : Home;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isCompose ? "New post" : "Go to feed"}
      className="absolute bottom-5 right-5 z-40 inline-flex size-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700"
    >
      <Icon size={24} aria-hidden />
    </button>
  );
}
