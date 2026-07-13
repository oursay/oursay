import type { RegisterFormData } from "@/components/chrome/RegisterForm";
import { handleValidationError, normalizeHandleBody } from "@/lib/handle";
import type { RegistrationProfile } from "@/lib/api/auth";

const KEY = "oursay.registrationDraft";

/** Persist registration form data across dev hot reloads (ref-only storage is lost on HMR). */
export function saveRegistrationDraft(data: RegisterFormData): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(data));
}

export function loadRegistrationDraft(): RegisterFormData | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RegisterFormData;
    if (!parsed?.email || !parsed?.handle) return null;
    return {
      email: parsed.email,
      handle: parsed.handle,
      displayName: parsed.displayName,
      over18: parsed.over18 !== false,
    };
  } catch {
    return null;
  }
}

export function clearRegistrationDraft(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(KEY);
}

/** Build the API profile body — never send `{}` (JSON.stringify drops undefined fields). */
export function registrationProfileForApi(draft: RegisterFormData): RegistrationProfile {
  const handle = normalizeHandleBody(draft.handle);
  if (!handle) {
    throw new Error(handleValidationError(draft.handle) ?? "Invalid handle.");
  }
  const profile: RegistrationProfile = {
    handle,
    over18: draft.over18 !== false,
  };
  const displayName = draft.displayName?.trim();
  if (displayName) profile.displayName = displayName;
  return profile;
}
