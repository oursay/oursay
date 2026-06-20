// Dev/test mailer adapter: records messages in an in-memory outbox instead of sending. Logs only
// the recipient + subject (never the body, which contains the OTP code). Tests read `outbox` to
// assert a mail was queued; they obtain the code through the service/DB, not from logs.

import type { MailAdapter, MailMessage } from "../mailer.js";

export class NoopMailAdapter implements MailAdapter {
  readonly vendor = "noop" as const;
  readonly outbox: MailMessage[] = [];

  async send(msg: MailMessage): Promise<void> {
    this.outbox.push(msg);
    // eslint-disable-next-line no-console
    console.log(`[mailer:noop] queued mail to=${msg.to} subject=${JSON.stringify(msg.subject)}`);
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
