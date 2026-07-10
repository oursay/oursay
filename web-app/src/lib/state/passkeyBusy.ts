export type PasskeyBusyPhase = "creating" | "authorizing" | "signing";
export type PasskeyBusyAnchor = "otp" | "login" | "profile" | "choose";

export type PasskeyBusy = { phase: PasskeyBusyPhase; anchor: PasskeyBusyAnchor };

export const PASSKEY_BUSY_LABEL: Record<PasskeyBusyPhase, string> = {
  creating: "Creating Passkey",
  authorizing: "Authorizing with Passkey",
  signing: "Signing with Passkey",
};

export const PASSKEY_BUSY_MESSAGE_DELAY_MS = 1500;

/** Schedules the delayed status label; returned cancel clears the timer (e.g. on phase change). */
export function schedulePasskeyBusyMessageReveal(
  onReveal: () => void,
  delayMs = PASSKEY_BUSY_MESSAGE_DELAY_MS,
): () => void {
  const timer = setTimeout(onReveal, delayMs);
  return () => clearTimeout(timer);
}
