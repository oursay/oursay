// OTP email copy for registration, recovery, and gated login.
// Renders vendor-agnostic MailMessage fields (subject / text / html) so Postmark, SMTP, SES,
// and noop all send the same content. This is an in-app template — not a Postmark Template alias.

import type { OtpPurpose } from "../../repo/otp.repo.js";

export interface OtpMailTemplateInput {
  purpose: OtpPurpose;
  code: string;
  /** Whole minutes shown in copy (rounded by the caller). */
  expiresInMinutes: number;
  /**
   * Absolute URL that opens the web app on the OTP entry screen
   * (`?otpEmail=` and optional `otpPurpose=`).
   */
  continueUrl?: string;
}

export interface OtpMailTemplate {
  subject: string;
  text: string;
  html: string;
}

const COPY: Record<OtpPurpose, { subject: string; label: string; intro: string }> = {
  registration: {
    subject: "Your OurSay verification code",
    label: "verification",
    intro: "Use this code to finish creating your OurSay account.",
  },
  recovery: {
    subject: "Your OurSay recovery code",
    label: "recovery",
    intro: "Use this code to recover your OurSay account and re-enroll a passkey.",
  },
  login: {
    subject: "Your OurSay sign-in code",
    label: "sign-in",
    intro: "Use this code to sign in on a new device. A trusted device must have already allowed the sign-in.",
  },
};

/**
 * Build OTP deep-link. Login: `?otpEmail=`. Registration: also sets `otpPurpose=registration`
 * so the client opens the registration verify screen (not gated login).
 */
export function otpContinueUrl(
  appOrigin: string,
  email: string,
  purpose: OtpPurpose = "login",
): string {
  const base = appOrigin.replace(/\/+$/, "");
  const url = new URL(base.endsWith("/") ? base : `${base}/`);
  url.searchParams.set("otpEmail", email);
  if (purpose === "registration") {
    url.searchParams.set("otpPurpose", "registration");
  }
  return url.toString();
}

/** @deprecated Prefer otpContinueUrl — kept for call-site clarity in login-only paths. */
export function otpLoginContinueUrl(appOrigin: string, email: string): string {
  return otpContinueUrl(appOrigin, email, "login");
}

export function buildOtpMailTemplate(input: OtpMailTemplateInput): OtpMailTemplate {
  const copy = COPY[input.purpose];
  const minutes = Math.max(1, Math.round(input.expiresInMinutes));
  const ignore = "If you didn't request this, you can ignore this email.";

  const textLines = [
    `Your OurSay ${copy.label} code is:`,
    "",
    input.code,
    "",
    copy.intro,
    `It expires in ${minutes} minutes.`,
  ];
  if (input.continueUrl) {
    textLines.push("", `Continue on OurSay:`, input.continueUrl);
  }
  textLines.push("", ignore);

  const subject = copy.subject;
  const text = textLines.join("\n");
  const html = renderHtml({
    label: copy.label,
    intro: copy.intro,
    code: input.code,
    minutes,
    continueUrl: input.continueUrl,
    ignore,
  });

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(opts: {
  label: string;
  intro: string;
  code: string;
  minutes: number;
  continueUrl?: string;
  ignore: string;
}): string {
  const code = escapeHtml(opts.code);
  const intro = escapeHtml(opts.intro);
  const ignore = escapeHtml(opts.ignore);
  const continueBlock = opts.continueUrl
    ? `<p style="margin:24px 0 0;font-size:15px;line-height:1.5;color:#3d4a3f;">
         <a href="${escapeHtml(opts.continueUrl)}" style="color:#1f6b4a;text-decoration:underline;">Open OurSay to enter your code</a>
       </p>`
    : "";

  // Inline CSS + table layout for broad client support. Keep copy monospace-forward and
  // brand-anchored; avoid decorative gradients / tracking pixels.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OurSay ${escapeHtml(opts.label)} code</title>
</head>
<body style="margin:0;padding:0;background:#e8eee9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8eee9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #c5d2c8;">
          <tr>
            <td style="padding:28px 28px 8px;">
              <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#145c3a;">OurSay</p>
              <h1 style="margin:16px 0 0;font-size:20px;line-height:1.35;font-weight:600;color:#142019;">Your ${escapeHtml(opts.label)} code</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;font-size:15px;line-height:1.55;color:#3a4a40;">
              <p style="margin:0;">${intro}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px;">
              <div style="display:inline-block;padding:14px 24px;background:#f0f6f2;border:1px solid #b7ccbe;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;letter-spacing:0.35em;color:#142019;">
                ${code}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;font-size:14px;line-height:1.55;color:#5c6b61;">
              <p style="margin:0;">This code expires in ${opts.minutes} minutes.</p>
              ${continueBlock}
              <p style="margin:20px 0 0;">${ignore}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
