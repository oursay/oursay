import Link from "next/link";
import { NoticeBox } from "@/components/ui/NoticeBox";

/** Prose section with a bold heading — shared shape for the help pages. */
function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

/**
 * Signing disclaimer + help — the WYSIWYS modal's "Disclaimer" link lands here
 * (WYSIWYS_LEARN_MORE_URL). Explains permanence, what a passkey signature means
 * for verified accounts, platform counts, and the non-affiliation disclaimer.
 */
export default function SigningHelpPage() {
  return (
    <div className="space-y-5 p-4">
      <header className="space-y-1">
        <h1 className="text-lg font-bold text-ink">Signing &amp; the public record</h1>
        <p className="text-xs text-muted">
          Draft — pending legal counsel review. This page will evolve before launch.
        </p>
      </header>

      <NoticeBox
        tone="info"
        lines={[
          "OurSay is an independent platform. It is not affiliated with, endorsed by, or acting for any government or electoral authority.",
          "Participation here is not an official election, referendum, or petition under any statute. Jurisdiction rules on this platform are OurSay configuration choices, not government requirements.",
        ]}
      />

      <HelpSection title="What you see is what you sign">
        <p>
          Before a vote, signature, or post commits, OurSay shows you the exact content being
          signed — the plain-language statement, the technical fields, and any warnings that
          apply to you. Nothing is added or changed after you confirm. If it isn&apos;t on that
          screen, you didn&apos;t sign it.
        </p>
      </HelpSection>

      <HelpSection title="Actions on the public record are permanent">
        <p>
          Signed civic actions are appended to a public, independently auditable record. Appends
          are permanent: the record is designed so history cannot be silently edited or erased —
          that is what makes its counts trustworthy. Some jurisdictions on the platform (including
          Alberta&apos;s configuration) also make votes and petition signatures final: they cannot
          be changed or revoked after signing. The confirmation screen warns you whenever an
          action is final.
        </p>
        <p>
          Think of confirming with your passkey the way you&apos;d think of signing a document,
          not liking a post.
        </p>
      </HelpSection>

      <HelpSection title="What signing means when your identity is verified">
        <p>
          Your passkey signature cryptographically binds the action to your account&apos;s civic
          persona. If you have verified your identity or residency, your <em>verification tier</em>
          {" "}travels with the action — that is how verified totals stay honest. Your legal name,
          address, and verification documents are never written to the public record; the record
          shows the persona (or your handle, if you chose to act publicly) and the tier, nothing
          more.
        </p>
        <p>
          Signing anonymously keeps your name off the record, but the action itself is still
          permanent and still counted under the rules above.
        </p>
      </HelpSection>

      <HelpSection title="Platform counts">
        <p>
          Anyone a jurisdiction&apos;s rules admit can participate. The <strong>platform
          count</strong> — the number that settles a poll or petition — includes only participants
          who meet that jurisdiction&apos;s verification floor (for Alberta: residency-verified).
          Actions below the floor are recorded and shown separately as unverified counts, and are
          included in the platform count once you verify. Platform counts are OurSay&apos;s own
          tallies; they are not official results of any government process.
        </p>
      </HelpSection>

      <HelpSection title="Demonstration preview">
        <p>
          This deployment is a demonstration preview. Accounts and content in the demo are
          fictional or sample data; profiles of public office holders are generated from the
          public record and do not imply those officials use or endorse OurSay. See the{" "}
          <Link href="/help/privacy" className="underline underline-offset-2">
            draft Privacy Notice
          </Link>{" "}
          for how registration data is handled.
        </p>
      </HelpSection>
    </div>
  );
}
