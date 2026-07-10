// Postmark adapter (default vendor). Token comes from config (POSTMARK_SERVER_TOKEN or
// POSTMARK_TOKEN); never logged. Uses the outbound transactional stream per Postmark guidance.

import { ServerClient } from "postmark";
import type { MailAdapter, MailMessage } from "../mailer.js";

export async function deliverPostmarkEmail(
  from: string,
  token: string,
  msg: MailMessage,
): Promise<string> {
  if (!token) {
    throw new Error("PostmarkMailAdapter requires POSTMARK_SERVER_TOKEN (or POSTMARK_TOKEN)");
  }
  const client = new ServerClient(token);
  const response = await client.sendEmail({
    From: from,
    To: msg.to,
    Subject: msg.subject,
    TextBody: msg.text,
    ...(msg.html ? { HtmlBody: msg.html } : {}),
    MessageStream: "outbound",
    Tag: "otp",
  });
  return response.MessageID;
}

export class PostmarkMailAdapter implements MailAdapter {
  readonly vendor = "postmark" as const;

  constructor(
    private readonly from: string,
    private readonly token: string,
  ) {}

  async send(msg: MailMessage): Promise<void> {
    const messageId = await deliverPostmarkEmail(this.from, this.token, msg);
    // MessageID is safe to log — never log msg.text (may contain OTP codes).
    // eslint-disable-next-line no-console
    console.log(`[mailer:postmark] sent messageId=${messageId} to=${msg.to}`);
  }
}
