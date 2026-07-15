import type { RecordKind } from "./records";

/**
 * How a civic action is authorised on this device.
 *
 *   ask     — prompt each time (Quick Sign vs Sign with Passkey chooser);
 *             "Remember my choice" on that modal persists Quick or Passkey
 *   quick   — derived-key "quick sign", no prompt (signTier 0)
 *   passkey — WebAuthn passkey, always (signTier 1); still shows the WYSIWYS
 *             confirm + OS passkey popup (the Ask chooser alone can be skipped)
 *
 * A jurisdiction may mandate a stronger method than the account default; the
 * effective method is never *less* secure than the jurisdiction floor
 * (see {@link effectiveSignMethod}).
 */
export type SignMethod = "ask" | "quick" | "passkey";

// Weakest → strongest, so the settings segmented control reads Quick · Ask · Passkey.
export const SIGN_METHODS: SignMethod[] = ["quick", "ask", "passkey"];

/**
 * Security order for "strongest wins" resolution: passkey > ask > quick.
 * `ask` sits above `quick` because it forces a conscious choice (and offers
 * passkey), so it can't be silently downgraded to a quick sign.
 */
export const SIGN_METHOD_RANK: Record<SignMethod, number> = {
  quick: 0,
  ask: 1,
  passkey: 2,
};

/** The stronger of two methods by {@link SIGN_METHOD_RANK}. */
export function strongestSignMethod(a: SignMethod, b: SignMethod): SignMethod {
  return SIGN_METHOD_RANK[a] >= SIGN_METHOD_RANK[b] ? a : b;
}

export const SIGN_METHOD_LABEL: Record<SignMethod, string> = {
  ask: "Ask",
  quick: "Quick",
  passkey: "Passkey",
};

/**
 * The civic actions a signing method can be set for. "Post" is composing a new
 * record and is split by kind (Statement/Petition/Poll) so each can differ; the
 * Signing Options UI offers a "Post" parent that sets all three at once.
 */
export type SignAction =
  | "post.statement"
  | "post.petition"
  | "post.poll"
  | "signature"
  | "vote"
  | "comment"
  | "reaction";

export const SIGN_ACTIONS: SignAction[] = [
  "post.statement",
  "post.petition",
  "post.poll",
  "signature",
  "vote",
  "comment",
  "reaction",
];

/** The three compose sub-actions the "Post" parent switch drives together. */
export const POST_SUB_ACTIONS: SignAction[] = [
  "post.statement",
  "post.petition",
  "post.poll",
];

export type SigningPrefs = Record<SignAction, SignMethod>;

/**
 * Defaults: heavier civic acts (compose, petition signature, poll vote) ask so
 * the signer chooses their strength; lightweight comments/reactions quick-sign.
 */
export const DEFAULT_SIGNING: SigningPrefs = {
  "post.statement": "ask",
  "post.petition": "ask",
  "post.poll": "ask",
  signature: "ask",
  vote: "ask",
  comment: "quick",
  reaction: "quick",
};

/** The compose sub-action for a record kind (Result is never composed). */
export function postActionForKind(kind: RecordKind): SignAction {
  switch (kind) {
    case "petition":
      return "post.petition";
    case "poll":
      return "post.poll";
    default:
      return "post.statement";
  }
}

/**
 * The signing method actually in force: the strongest of the account preference
 * and the jurisdiction's requirement (passkey > ask > quick). The account can
 * always opt *up*, and the jurisdiction can raise a weaker preference — neither
 * is ever silently downgraded.
 */
export function effectiveSignMethod(
  pref: SignMethod,
  jurisdictionRequirement: SignMethod,
): SignMethod {
  return strongestSignMethod(pref, jurisdictionRequirement);
}

/**
 * Apply "Remember my choice" from the Ask chooser: set one action to Quick or
 * Passkey. Returns the prior prefs unchanged when `remember` is false.
 */
export function applyRememberedSignChoice(
  prefs: SigningPrefs,
  action: SignAction,
  sign: "quick" | "passkey",
  remember: boolean,
): SigningPrefs {
  if (!remember) return prefs;
  return { ...prefs, [action]: sign };
}
