# OurSay.ca

**An open source, verified, auditable civic platform — built for any democratic system, anywhere.**

OurSay gives communities a structured way to express political beliefs, sign petitions, and participate in public votes. Every result is public, broken down by geographic area, and verifiable by anyone — independently, without taking our word for it. It launches in Alberta, Canada and is designed to be deployed for any jurisdiction in the world.

This repository contains the complete source code, infrastructure configuration, and foundational documentation for OurSay.ca. Everything here is public and auditable by design.

---

## Why This Exists

Representative democracy was designed for a world without instant communication. Between elections, citizens have no verified, persistent, auditable mechanism to make their views known. Opinion polls can be commissioned for a conclusion. Online petitions have no way to confirm signatures are real. Social media amplifies the loudest voices, not the most representative ones.

OurSay fills that gap. Not as a replacement for elections — as the infrastructure that should have existed alongside them all along.

---

## What the Platform Does

- **Beliefs** — Participants create statements. Others agree or disagree. Counts are public, filterable by geographic area and verification tier.
- **Petitions** — Formal calls to action addressed to a specific authority. Signatures are collected, broken down by verification tier, and can be delivered to named officials.
- **Public Votes** — Formal votes on specific questions. Votes are final once cast. Results are published publicly and anchored in a distributed public database that anyone can audit.
- **Results** — The permanent record of a closed public vote, designed to be tamper-resistant, broken down by geographic area and verification tier.

All content types link together. A public vote can trace back to the petitions and grassroots beliefs that shaped it.

---

## Verified vs. Unverified

Anyone can participate on OurSay without verifying their identity. Unverified participation counts and is publicly visible.

Verified users have confirmed their identity and residency through a pluggable KYC process, configurable per region. Their actions are distinguished by verification tier in every count and filter. Verification has a real cost — users pay it directly, at cost, with no markup. Users who cannot afford verification can join a public waitlist and receive community sponsorships.

---

## Auditability

- Every production deployment is hashed and that hash is published here and in a distributed public database
- Any person can independently reproduce and verify any result published on the platform
- Users can audit their own actions and verify them against the public record at any time
- No result requires trusting OurSay — the audit tools are in this repository and work without our servers

---

## Repository Structure

```
/
├── docs/
│   ├── 01-CONTRIBUTOR-SPEC.md     # Canonical product specification — read this first
│   ├── 02-PUBLIC-EXPLAINER.md     # Public-facing platform overview
│   └── 03-OUTREACH-TEMPLATE.md    # Audience-specific outreach templates
├── DEPLOYMENTS.md                 # Published build hashes for every production deployment
└── ...                            # Source code, infrastructure config (in progress)
```

---

## Start Here: Foundational Documents

These three documents define the project. Before writing any code, read the contributor spec.

### [`docs/01-CONTRIBUTOR-SPEC.md`](docs/01-CONTRIBUTOR-SPEC.md) — Contributor Reference

The canonical product specification. Covers what the system does and why — not how to implement it. When a design question comes up, this document answers it. If it doesn't, the answer belongs in a GitHub issue, then in this document before the issue closes.

Covers: guiding principles, verification tiers, pluggable KYC provider architecture, sponsorship and waitlist mechanics, generic geographic area model, public API, the full content model (beliefs, petitions, public votes, results), the anonymity model, the distributed public ledger, build verification, forkability and global adaptability, and contributor decision-making.

**Read this before touching the schema, the API, or the frontend.**

### [`docs/02-PUBLIC-EXPLAINER.md`](docs/02-PUBLIC-EXPLAINER.md) — Public Platform Overview

A plain-language explanation of OurSay for users. Explains why representative democracy hasn't kept up with the world, what OurSay does, why the verification tier distinction matters, how anonymity and auditability coexist, and the cost model behind verification. Written for the Alberta launch but reflects the platform's broader mission.

Not aimed at contributors — aimed at participants.

### [`docs/03-OUTREACH-TEMPLATE.md`](docs/03-OUTREACH-TEMPLATE.md) — Outreach Templates

Audience-specific email templates for outreach to Alberta MLAs, Elections Alberta, federal MPs, municipal politicians, and media and political creators. Each section is tailored to the recipient's core values and concerns.

---

## Infrastructure Decisions (Locked)

Some decisions are made and should be treated as constraints:

| Concern | Decision |
|---|---|
| Hosting | Google Cloud Platform or AWS |
| KYC / Identity Verification | Pluggable, configurable per region — Equifax Connect preferred for Alberta launch |
| Distributed public database | See contributor spec — internal implementation detail |
| Source control | This repository (GitHub, public) |
| Public API | Read-only, unauthenticated, OpenAPI spec in repository |
| Build auditability | Every deployment hashed and published in `DEPLOYMENTS.md` and on-chain |

Everything else — backend framework, frontend framework, database technology, API design — is a contributor decision, informed by the spec.

---

## Contributing

OurSay is in its early stages. Foundational documents are established. Code contributions, architecture proposals, and RFC discussions are welcome.

**Before contributing:**

1. Read [`docs/01-CONTRIBUTOR-SPEC.md`](docs/01-CONTRIBUTOR-SPEC.md) in full
2. Check open issues for existing discussion on the area you want to work on
3. For significant design decisions, open an issue or RFC before writing code

**Ground rules:**

- No secrets, credentials, or private keys are ever committed
- Significant design changes update the contributor spec before the issue closes
- All infrastructure changes are committed as code so the hosting configuration is auditable

Pull requests, issues, and architectural discussions are all welcome.

---

## Project Status

🟡 **Pre-launch — foundational stage**

Foundational documents are complete. Architecture, schema, and initial application code are under active development. The platform is not yet live.

---

## License

OurSay.ca is licensed under the **GNU General Public License v3.0** (GPL v3).

### Why GPL v3?

OurSay is civic infrastructure. It is designed to be deployed by other provinces, municipalities, and democracies as-is or with adaptation. GPL v3 ensures that:

- **OurSay remains open.** Any adaptation, deployment, or derivative must remain open source. This prevents proprietary forks and ensures the community benefits from improvements made anywhere.
- **The public retains the public good.** Civic infrastructure should not be privatized. If someone builds on OurSay's code, the public gets access to the improvements.
- **Contributors are protected.** Your work cannot be enclosed and sold back to the public as a proprietary service.

> **Note:** The platform's fork requirements — that *any deployment* must keep source public and auditable — may more precisely require **AGPL v3**, which covers network use as distribution and therefore requires source publication for hosted instances. GPL v3 may not require this for web-based deployments. This should be resolved before the first public deployment. See open GitHub issue [TBD].

### What this means for you

- You can use, modify, and deploy OurSay freely
- If you modify OurSay, publish your changes under GPL v3
- You cannot create a closed-source derivative and sell it without publishing the source

For full details, see [`LICENSE`](LICENSE) in this repository, or visit [gnu.org/licenses/gpl-3.0.html](https://www.gnu.org/licenses/gpl-3.0.html).

### Contributing under GPL v3

By contributing to OurSay, you agree that your contribution is licensed under GPL v3. The project retains no copyright over contributions — contributors retain copyright and license their work to OurSay under GPL v3.

If you have questions about licensing, open an issue.

---

## Contact

oursay.ca@gmail.com

---

*OurSay.ca is not affiliated with any political party or government body.*
