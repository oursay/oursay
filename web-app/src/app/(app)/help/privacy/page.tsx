import Link from "next/link";
import { NoticeBox } from "@/components/ui/NoticeBox";

function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

const CONTACT_EMAIL = "oursay.ca@gmail.com";

/**
 * Draft platform Privacy Notice — linked from registration consent and the
 * signing help page. Covers the platform/demo (the marketing site at oursay.ca
 * has its own notice scoped to its forms).
 */
export default function PrivacyHelpPage() {
  return (
    <div className="space-y-5 p-4">
      <header className="space-y-1">
        <h1 className="text-lg font-bold text-ink">Privacy Notice — OurSay platform</h1>
        <p className="text-xs text-muted">Effective July 2026 · covers this app, including the demonstration preview</p>
      </header>

      <NoticeBox
        tone="notice"
        lines={[
          "DRAFT — pending legal counsel review.",
          "This notice reflects how the platform is built to behave today. It will be finalized with counsel before public launch.",
        ]}
      />

      <HelpSection title="What we collect">
        <p>
          <strong>To register:</strong> an email address, a handle, an optional display name, and
          your confirmation that you are 18 or older. A handle is enough to participate — you have
          the right to join anonymously.
        </p>
        <p>
          <strong>If you choose to verify (optional):</strong> your legal name and home address,
          used to verify identity and residency through our verification provider (Didit) and to
          infer your home districts from your address. We store the verification outcome (your
          tier), not your identity documents.
        </p>
      </HelpSection>

      <HelpSection title="What stays private">
        <p>
          Your legal name, address, email, and verification details are never shown on the public
          record or to other members. Your district membership is inferred from your address and
          used only in aggregate or as coarse relations (for example, &quot;same district as
          you&quot;) — never as a raw address or location. Public surfaces show your handle or a
          pseudonymous persona, your chosen display name, and your verification tier.
        </p>
      </HelpSection>

      <HelpSection title="The public record is permanent">
        <p>
          Civic actions you sign (votes, petition signatures, posts) are appended to a permanent,
          publicly auditable record under your persona or handle, per your visibility choice. See{" "}
          <Link href="/help/signing" className="underline underline-offset-2">
            Signing &amp; the public record
          </Link>
          . Account and profile data are deletable; signed public-record entries are designed not
          to be — consider that before signing publicly.
        </p>
      </HelpSection>

      <HelpSection title="Why we collect it">
        <p>
          To operate accounts and sessions, to verify identity and residency so counts can be
          trusted, to compute district-level participation, and to email you one-time codes for
          registration, login, and recovery. We do not sell personal information and we do not use
          it for advertising.
        </p>
      </HelpSection>

      <HelpSection title="Demonstration preview">
        <p>
          This deployment is a demonstration. Please do not submit real sensitive information you
          are not comfortable with at this stage; demo data may be reset. Accounts and content you
          see in the demo are fictional or sample data.
        </p>
      </HelpSection>

      <HelpSection title="Your rights and contact">
        <p>
          Under Alberta&apos;s Personal Information Protection Act (PIPA) and Canada&apos;s PIPEDA
          you may ask what we hold about you, ask us to correct it, or ask us to delete your
          account data. Withdraw consent or exercise any of these by emailing{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </HelpSection>
    </div>
  );
}
