"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  PASSKEY_BUSY_LABEL,
  schedulePasskeyBusyMessageReveal,
  type PasskeyBusyPhase,
} from "@/lib/state/passkeyBusy";

interface PasskeyBusyOverlayProps {
  phase: PasskeyBusyPhase;
}

/** In-modal dim/blur + spinner while the browser passkey sheet is open. */
export function PasskeyBusyOverlay({ phase }: PasskeyBusyOverlayProps) {
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    setShowMessage(false);
    return schedulePasskeyBusyMessageReveal(() => setShowMessage(true));
  }, [phase]);

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-surface/60 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 size={32} className="animate-spin text-brand-600" aria-hidden />
      <p
        className={`mt-3 text-sm font-medium text-ink transition-opacity duration-500 ${
          showMessage ? "opacity-100" : "opacity-0"
        }`}
      >
        {PASSKEY_BUSY_LABEL[phase]}
      </p>
    </div>
  );
}
