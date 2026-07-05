// Data access for auth.signing_prefs (C1): per-action signing preference (quick | ask | passkey).
// Preferences pick the method ABOVE the jurisdiction gate floor; the floor itself is enforced by the
// civic write path regardless of what is stored here.

import type pg from "pg";

export type SigningPref = "quick" | "ask" | "passkey";
export type SigningPrefs = Record<string, SigningPref>;

const VALID_PREFS = new Set<SigningPref>(["quick", "ask", "passkey"]);

/** Drop unknown-shaped entries so a hand-edited row can't smuggle junk into responses. */
export function sanitizePrefs(raw: unknown): SigningPrefs {
  const out: SigningPrefs = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string" && VALID_PREFS.has(v as SigningPref)) out[k] = v as SigningPref;
    }
  }
  return out;
}

export class SigningPrefsRepo {
  constructor(private readonly pool: pg.Pool) {}

  async get(userId: string): Promise<SigningPrefs> {
    const { rows } = await this.pool.query(`SELECT prefs FROM auth.signing_prefs WHERE user_id = $1`, [userId]);
    return sanitizePrefs(rows[0]?.prefs);
  }

  /** Merge a partial prefs patch into the stored map (a null value deletes that action's pref). */
  async patch(userId: string, patch: Record<string, SigningPref | null>): Promise<SigningPrefs> {
    const current = await this.get(userId);
    for (const [action, pref] of Object.entries(patch)) {
      if (pref === null) delete current[action];
      else if (VALID_PREFS.has(pref)) current[action] = pref;
    }
    await this.pool.query(
      `INSERT INTO auth.signing_prefs(user_id, prefs, updated_at) VALUES($1,$2,now())
       ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()`,
      [userId, JSON.stringify(current)],
    );
    return current;
  }
}
