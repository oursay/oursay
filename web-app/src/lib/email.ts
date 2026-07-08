/** Practical client-side email shape check (not full RFC). */
export function isValidEmailFormat(raw: string): boolean {
  const email = raw.trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
