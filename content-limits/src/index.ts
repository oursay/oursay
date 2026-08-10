// @oursay/content-limits — platform content-cap types + defaults.
//
// Zero runtime dependencies. Isomorphic floor so api validators
// (`@oursay/public-record`), packaged jurisdiction configs
// (`@oursay/jurisdiction-data`), and web-app composers share ONE source.
// Kept out of `@oursay/public-record`'s main barrel because that package
// pulls Node-only stores (pg) unsuitable for the Next.js client bundle.

/** Hard content caps per record type, enforced at create/update by per-type validators
 *  ([code-post-content-fields]) — this config only DEFINES + EXPOSES them. Per-type nested numeric
 *  caps; absent type/field ⇒ no cap from this seam. */
export interface JurisdictionContentLimits {
  post?: { title?: number; body?: number };
  comment?: { body?: number };
  petition?: { title?: number; text?: number };
  poll?: {
    question?: number;
    option?: number;
    maxOptions?: number;
    description?: number;
  };
}

/** Platform default content caps (the documented Alberta/launch caps; also the global defaults). */
export const DEFAULT_CONTENT_LIMITS: JurisdictionContentLimits = {
  post: { title: 200, body: 2000 },
  comment: { body: 2000 },
  petition: { title: 200, text: 5000 },
  poll: { question: 200, option: 100, maxOptions: 10, description: 2000 },
};
