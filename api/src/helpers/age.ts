// Pure age-gate logic. `now` is injected so the rule is deterministic and testable — the HTTP layer
// passes the real clock; RegistrationService owns the policy (docs/01 §4.3: minimum age 18).

/** Whole years elapsed from `birthdate` to `now` (calendar-correct, not 365.25-based). */
export function ageInYears(birthdate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthdate.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birthdate.getUTCMonth();
  const dayDelta = now.getUTCDate() - birthdate.getUTCDate();
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) age -= 1;
  return age;
}

/** True when the person born on `birthdate` is at least `minYears` old at `now`. */
export function ageAtLeast(birthdate: Date, minYears: number, now: Date): boolean {
  return ageInYears(birthdate, now) >= minYears;
}

/** Parse a strict YYYY-MM-DD date string to a UTC Date, or null if malformed/not a real date. */
export function parseBirthdate(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject overflow like 2021-02-31 (which JS would roll forward).
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}
