# OurSay — marketing & explainer site

Public-facing website for OurSay. Static [Astro](https://astro.build) + Tailwind CSS v4. This is **workspace 1** of the OurSay monorepo (future: `web-app/`, `db/`, `mobile-app/`).

## Run it

From the repo root:

```bash
npm install                      # installs all workspaces
npm run dev --workspace site     # local dev server
npm run build --workspace site   # static build → site/dist
npm run preview --workspace site # serve the built output
```

## Where to edit things (single swap-points)

| What | File |
|---|---|
| **Form targets** (Google Forms URLs / embeds) | `src/data/forms.ts` — drop in the real `forms.gle/...` links; set `embedUrl` to render an inline iframe instead of a button |
| **Facts & citations** (every on-page statistic) | `src/data/facts.json` — each entry renders on `/sources`; reference it inline with `<Cite id="..." />` |
| **Audience copy** | `src/data/audiences.ts` |
| **Site constants** (GitHub, contact email, nav, disclaimer, license) | `src/data/site.ts` |
| **Live platform stats** (post-launch) | `src/components/LiveStats.astro` — disabled stub wired for the public API |

## Claims policy (read before publishing)

- **No unsourced statistics.** Every number shown must have a `facts.json` entry and a `<Cite>`; all of them appear on `/sources`.
- **Re-verify the must-verify facts against primary sources before launch** (the voter-data exposure, petition fee, thresholds, court rulings, election/referendum costs).
- **No endorsement, certification, or affiliation claims.** The non-affiliation disclaimer (from `src/data/site.ts`) renders in the footer on every page.
- **No absolute security/permanence language** — use "designed to be tamper-resistant", "auditable", "verifiable".

## Before launch

- Replace `public/og-image.svg` with a 1200×630 **PNG** (X/Facebook don't reliably render SVG share images) and point `Base.astro`'s `ogImage` default at it.
- Set real Google Form URLs in `src/data/forms.ts`.
- Update the `site` value in `astro.config.mjs` and the contact email in `src/data/site.ts` if they change.
