import type { RegisterFormData } from "@/components/chrome/RegisterForm";
import { handleValidationError, normalizeHandleBody } from "@/lib/handle";
import type { RegistrationProfile } from "@/lib/api/auth";

const KEY = "oursay.registrationDraft";

function hasAddressContent(
  address: RegisterFormData["address"] | undefined,
): address is NonNullable<RegisterFormData["address"]> {
  if (!address) return false;
  return [address.line1, address.city, address.province, address.postalCode].some(
    (v) => (v?.trim().length ?? 0) > 0,
  );
}

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
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      address: parsed.address,
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
  const firstName = draft.firstName?.trim();
  if (firstName) profile.firstName = firstName;
  const lastName = draft.lastName?.trim();
  if (lastName) profile.lastName = lastName;
  if (hasAddressContent(draft.address)) {
    profile.address = {
      line1: draft.address.line1?.trim() || undefined,
      city: draft.address.city?.trim() || undefined,
      province: draft.address.province?.trim() || undefined,
      postalCode: draft.address.postalCode?.trim() || undefined,
      country: draft.address.country?.trim() || "CA",
    };
  }
  return profile;
}
