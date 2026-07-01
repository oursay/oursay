"use client";

import { Feather, Newspaper } from "lucide-react";

interface FabProps {
  /** compose = Feed's new-post (quill); home = go to Feed (newspaper) elsewhere. */
  variant: "compose" | "home";
  onClick?: () => void;
}

/** Primary floating action — brand-filled to match the account affordance. */
export function Fab({ variant, onClick }: FabProps) {
  const isCompose = variant === "compose";
  const Icon = isCompose ? Feather : Newspaper;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isCompose ? "New post" : "Go to feed"}
      className="absolute bottom-5 right-5 z-40 inline-flex size-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 hover:bg-brand-700"
    >
      <Icon size={26} strokeWidth={2} aria-hidden />
    </button>
  );
}
