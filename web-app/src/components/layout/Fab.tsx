"use client";

import { Feather, Newspaper } from "lucide-react";

interface FabProps {
  /** compose = Feed's new-post (quill); home = go to Feed (newspaper) elsewhere. */
  variant: "compose" | "home";
  onClick?: () => void;
}

/** Primary floating action button — fixed to the app frame, wireframe-dark fill. */
export function Fab({ variant, onClick }: FabProps) {
  const isCompose = variant === "compose";
  const Icon = isCompose ? Feather : Newspaper;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isCompose ? "New post" : "Go to feed"}
      className="absolute bottom-5 right-5 z-40 inline-flex size-14 items-center justify-center rounded-full bg-ink text-white shadow-lg hover:bg-ink-soft"
    >
      <Icon size={26} strokeWidth={2} aria-hidden />
    </button>
  );
}
