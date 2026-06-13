/*
  v1 capture = Google Forms. Drop the published Google Form URLs in below.
  - `*Url`      : the public "viewform" link (used by CTA buttons).
  - `*EmbedUrl` : the "?embedded=true" link (used to render an inline <iframe>).
                  Leave empty ("") to fall back to a button instead of an embed.

  This is the single swap-point: when we move off Google Forms to a hosted
  service or the OurSay backend, only this file changes — no layout edits.
*/

export interface FormConfig {
  /** Public viewform link for CTA buttons. */
  url: string;
  /** Embeddable link (?embedded=true) for inline <iframe>, or "" to use a button. */
  embedUrl: string;
  /** Approximate iframe height in px (Google Forms cannot auto-resize cross-origin). */
  embedHeight?: number;
}

export const forms: { waitlist: FormConfig; contact: FormConfig } = {
  // Citizens / general public — join the launch waitlist.
  waitlist: {
    url: "https://forms.gle/REPLACE_WITH_WAITLIST_FORM",
    embedUrl: "",
    embedHeight: 900,
  },
  // Representatives & journalists — get in touch.
  contact: {
    url: "https://forms.gle/REPLACE_WITH_CONTACT_FORM",
    embedUrl: "",
    embedHeight: 900,
  },
};

/** True once a real Google Form URL has been wired in (not the placeholder). */
export function isFormConfigured(form: FormConfig): boolean {
  return !form.url.includes("REPLACE_WITH");
}
