"use client";

import type { ReactNode } from "react";
import { Copy, Flag, Link as LinkIcon, Mail, MessageCircle } from "lucide-react";
import { Modal } from "@/components/ui";
import { RecordCardHeader } from "@/components/content";
import type { ShareTarget } from "@/lib/state";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  /** What's being shared (null when closed). */
  target: ShareTarget | null;
  /** Toast callback for copy / demo-only channels. */
  onNotify: (message: string) => void;
  /** Called when a share action completes — counts the share (once per account). */
  onShared: () => void;
  /** Opens the report flow for this record / comment. */
  onReport: () => void;
}

/** Absolute share link — origin + the in-app path (falls back to the path SSR-side). */
function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pre-launch copy switch. While OurSay is in demo, shared/copied text is a
 * launch-promo blurb (with a link to the demo app) instead of the record's own
 * text — the preview card in the modal still shows the real post/comment.
 * Set NEXT_PUBLIC_SHARE_DEMO="false" to share actual post data instead.
 */
const SHARE_DEMO_MODE = process.env.NEXT_PUBLIC_SHARE_DEMO !== "false";
/** Where the promo blurb points (override with NEXT_PUBLIC_SHARE_DEMO_URL). */
const SHARE_DEMO_URL =
  process.env.NEXT_PUBLIC_SHARE_DEMO_URL ?? "https://demo.oursay.ca";
const SHARE_DEMO_BLURB =
  "I'm trying the demo for the new OurSay app, launching in Alberta soon. Check it out at:";
const SHARE_DEMO_TITLE = "OurSay — launching in Alberta soon";

/** Monochrome brand glyphs (lucide dropped these) — inherit currentColor. */
function FacebookGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13.5 21v-7h2.34l.35-2.72H13.5V9.54c0-.79.22-1.32 1.35-1.32h1.44V5.79c-.25-.03-1.1-.11-2.1-.11-2.08 0-3.5 1.27-3.5 3.6v2H8.34V14h2.35v7h2.81z" />
    </svg>
  );
}

function InstagramGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function XGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.53 3h3.02l-6.6 7.54L21.75 21h-6.09l-4.77-6.23L5.43 21H2.4l7.06-8.07L2.25 3h6.24l4.31 5.7L17.53 3zm-1.06 16.2h1.67L7.6 4.71H5.8l10.67 14.49z" />
    </svg>
  );
}

function TikTokGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.5 3c.28 2.03 1.62 3.63 3.5 3.86v2.62c-1.28.08-2.5-.28-3.6-.94v5.94c0 3.02-2.4 5.52-5.4 5.52S5.6 17.5 5.6 14.5s2.4-5.5 5.4-5.5c.31 0 .61.03.9.08v2.78c-.29-.1-.59-.16-.9-.16-1.5 0-2.72 1.24-2.72 2.8s1.22 2.8 2.72 2.8 2.72-1.24 2.72-2.8V3h2.78z" />
    </svg>
  );
}

function RedditGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 11.82c0-1.1-.9-2-2-2-.52 0-1 .2-1.36.53-1.36-.9-3.2-1.48-5.24-1.56l.9-4.02 2.84.63c.02.71.6 1.28 1.32 1.28.73 0 1.32-.6 1.32-1.33 0-.73-.59-1.32-1.32-1.32-.51 0-.96.3-1.17.72l-3.2-.71a.34.34 0 0 0-.4.26l-1 4.49c-2.05.09-3.9.66-5.27 1.56A1.98 1.98 0 0 0 4 9.82c-1.1 0-2 .9-2 2 0 .78.45 1.45 1.1 1.78-.03.2-.05.4-.05.6 0 2.9 3.4 5.26 7.58 5.26 4.18 0 7.58-2.36 7.58-5.27 0-.2-.02-.4-.05-.59.63-.33 1.09-1 1.09-1.78zM7.3 13.24c0-.73.6-1.32 1.33-1.32.72 0 1.31.59 1.31 1.32 0 .73-.59 1.32-1.31 1.32-.74 0-1.33-.6-1.33-1.32zm7.44 3.52c-.9.9-2.65.97-3.16.97-.5 0-2.25-.06-3.16-.97a.35.35 0 0 1 0-.49.35.35 0 0 1 .5 0c.57.57 1.8.78 2.66.78.87 0 2.1-.2 2.67-.78a.35.35 0 0 1 .49 0 .35.35 0 0 1 0 .5zm-.24-2.2c-.73 0-1.32-.6-1.32-1.32 0-.73.59-1.32 1.32-1.32.72 0 1.31.59 1.31 1.32 0 .72-.59 1.32-1.31 1.32z" />
    </svg>
  );
}

interface ShareAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Report gets a subtle danger accent. */
  danger?: boolean;
}

export function ShareModal({
  open,
  onClose,
  target,
  onNotify,
  onShared,
  onReport,
}: ShareModalProps) {
  if (!open || !target) return null;

  const isComment = target.variant === "comment";
  const bodyText = target.body.join("\n");
  const realText = target.title ? `${target.title}\n\n${bodyText}` : bodyText;
  const shareLabel = isComment ? "comment" : "post";

  // Demo mode swaps the shared text + link for the launch promo; real mode uses
  // the record's own text and its in-app URL.
  const linkUrl = SHARE_DEMO_MODE ? SHARE_DEMO_URL : absoluteUrl(target.path);
  const messageText = SHARE_DEMO_MODE ? SHARE_DEMO_BLURB : realText;
  const shareTitle = SHARE_DEMO_MODE
    ? SHARE_DEMO_TITLE
    : target.title ?? "Shared from OurSay";
  // "Copy text" bundles the link so the pasted blurb is self-contained; real
  // mode keeps copying just the record text (link lives on "Copy link").
  const copyText = SHARE_DEMO_MODE ? `${messageText} ${linkUrl}` : realText;

  const enc = encodeURIComponent;

  const copy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) onShared();
    onNotify(ok ? `${label} copied.` : `Copy failed — ${label.toLowerCase()} unavailable.`);
    onClose();
  };

  const openExternal = (href: string) => {
    window.open(href, "_blank", "noopener,noreferrer");
    onShared();
    onClose();
  };

  const actions: ShareAction[] = [
    // Row 1 — socials.
    {
      key: "facebook",
      label: "Facebook",
      icon: <FacebookGlyph />,
      onClick: () =>
        openExternal(`https://www.facebook.com/sharer/sharer.php?u=${enc(linkUrl)}`),
    },
    {
      key: "x",
      label: "X",
      icon: <XGlyph />,
      onClick: () =>
        openExternal(
          `https://twitter.com/intent/tweet?text=${enc(messageText)}&url=${enc(linkUrl)}`,
        ),
    },
    {
      key: "instagram",
      label: "Instagram",
      icon: <InstagramGlyph />,
      // Instagram has no web share intent — copy the shareable text for the app.
      onClick: () => copy(copyText, "Text"),
    },
    {
      key: "reddit",
      label: "Reddit",
      icon: <RedditGlyph />,
      onClick: () =>
        openExternal(
          `https://www.reddit.com/submit?url=${enc(linkUrl)}&title=${enc(shareTitle)}`,
        ),
    },
    {
      key: "tiktok",
      label: "TikTok",
      icon: <TikTokGlyph />,
      // TikTok has no web share intent — copy the shareable text for the app.
      onClick: () => copy(copyText, "Text"),
    },
    // Row 2 — utilities.
    {
      key: "copy-text",
      label: "Copy text",
      icon: <Copy size={18} aria-hidden />,
      onClick: () => copy(copyText, "Text"),
    },
    {
      key: "copy-link",
      label: "Copy link",
      icon: <LinkIcon size={18} aria-hidden />,
      onClick: () => copy(linkUrl, "Link"),
    },
    {
      key: "email",
      label: "Email",
      icon: <Mail size={18} aria-hidden />,
      onClick: () =>
        openExternal(
          `mailto:?subject=${enc(shareTitle)}&body=${enc(
            `${messageText}\n\n${linkUrl}`,
          )}`,
        ),
    },
    {
      key: "sms",
      label: "SMS",
      icon: <MessageCircle size={18} aria-hidden />,
      onClick: () => openExternal(`sms:?&body=${enc(`${messageText} ${linkUrl}`)}`),
    },
    {
      key: "report",
      label: "Report",
      icon: <Flag size={18} aria-hidden />,
      danger: true,
      onClick: onReport,
    },
  ];

  return (
    <Modal open={open} onClose={onClose} title={`Share ${shareLabel}`} size="dialog">
      <div className="space-y-4">
        {/* Preview of the card being shared. */}
        <div className="rounded-xl border border-border bg-surface-muted p-3">
          {isComment ? (
            <>
              <RecordCardHeader
                author={target.author}
                tier={target.tier}
                signTier={target.signTier}
                authorGeo={target.authorGeo}
                identity={target.identity}
                timestamp={target.timestamp}
                depth={target.depth}
                variant="comment"
              />
              <div className="mt-1 space-y-1 pl-8 text-sm text-ink-soft">
                {target.body.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </>
          ) : (
            <>
              <RecordCardHeader
                author={target.author}
                handle={target.handle}
                tier={target.tier}
                signTier={target.signTier}
                authorGeo={target.authorGeo}
                identity={target.identity}
              />
              {target.title ? (
                <h3 className="mt-1 text-[15px] font-bold text-ink">
                  {target.title}
                </h3>
              ) : null}
              <div className="mt-1 line-clamp-4 space-y-1 text-sm text-ink-soft">
                {target.body.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Share destinations. */}
        <div className="grid grid-cols-5 gap-x-2 gap-y-3">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              className="flex flex-col items-center gap-1.5 text-center"
            >
              <span
                className={`inline-flex size-11 items-center justify-center rounded-full border transition-colors ${
                  action.danger
                    ? "border-danger-200 bg-danger-50 text-danger-700 hover:bg-danger-100"
                    : "border-border bg-surface text-ink-soft hover:bg-surface-muted"
                }`}
              >
                {action.icon}
              </span>
              <span className="text-[11px] leading-tight text-muted">
                {action.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
