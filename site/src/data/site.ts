/** Site-wide constants. Update placeholders before launch. */

export const site = {
  name: "OurSay",
  domain: "oursay.ca",
  tagline: "Make Our Say.",
  githubUrl: "https://github.com/OurSay/oursay",
  contactEmail: "oursay.ca@gmail.com",
} as const;

export const navLinks = [
  { label: "The problem", href: "/#problem" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Who it's for", href: "/#who-its-for" },
  { label: "The cost", href: "/#cost" },
  { label: "Trust", href: "/#trust" },
] as const;

/**
 * Required government non-affiliation disclaimer (Contributor Spec §13.3).
 * Must appear on every public page.
 */
export const nonAffiliationDisclaimer =
  "OurSay is a private platform. It is not affiliated with, endorsed by, or approved by any government body or electoral authority. Identity verification is performed by a commercial third-party provider and does not constitute a determination of electoral eligibility, voter registration status, or citizenship.";

export const license = {
  name: "GNU General Public License v3.0",
  shortName: "GPL v3",
  url: "https://www.gnu.org/licenses/gpl-3.0.html",
} as const;

/**
 * Misspelled-domain redirect banner.
 *
 * A plain 301 from albertareferrendum2026.ca → oursay.ca does not tell the app
 * which hostname the visitor typed. Append a query param on the redirect target:
 *
 *   https://oursay.ca/?utm_source=albertareferrendum2026.ca
 *
 * (`?from=albertareferrendum2026.ca` and older shorthand values are also recognized.)
 */
export const misspelledRedirect = {
  intendedUrl: "https://albertareferendum2026.ca",
  intendedDomain: "albertareferendum2026.ca",
  queryKey: "from",
  fromValues: ["albertareferrendum2026.ca", "albertareferrendum"],
  utmSources: ["albertareferrendum2026.ca", "albertareferrendum2026"],
  sessionKey: "oursay:misspelled-redirect",
  dismissedKey: "oursay:misspelled-banner-dismissed",
} as const;
