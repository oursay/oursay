// Dev/test mailer adapter: records messages in an in-memory outbox instead of sending. In
// non-production, also prints OTP codes to the console so manual Swagger walks work without
// Postmark/SMTP. Production never echoes codes (even if noop is misconfigured). Tests read
// `outbox` directly and do not rely on console output.

import type { MailAdapter, MailMessage } from "../mailer.js";

/** True when OTP codes may be echoed to the dev console (never in production). */
function mayEchoOtpToConsole(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Pull the first digit run from the OTP mail body (same shape tests expect). */
function otpFromBody(text: string): string | undefined {
  const m = /(\d{4,8})/.exec(text);
  return m?.[1];
}

export class NoopMailAdapter implements MailAdapter {
  readonly vendor = "noop" as const;
  readonly outbox: MailMessage[] = [];

  async send(msg: MailMessage): Promise<void> {
    this.outbox.push(msg);
    // eslint-disable-next-line no-console
    console.log(`[mailer:noop] queued mail to=${msg.to} subject=${JSON.stringify(msg.subject)}`);
    if (mayEchoOtpToConsole()) {
      const code = otpFromBody(msg.text);
      if (code) {
        // eslint-disable-next-line no-console
        console.log(`[mailer:noop:dev] OTP for ${msg.to}: ${code}`);
      }
    }
  }

  /** Most recent message to an address, if any (test convenience). */
  last(to?: string): MailMessage | undefined {
    const list = to ? this.outbox.filter((m) => m.to === to) : this.outbox;
    return list[list.length - 1];
  }

  clear(): void {
    this.outbox.length = 0;
  }
}
