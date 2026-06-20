// Postmark adapter (default vendor). Token comes from config (env POSTMARK_TOKEN); never logged.

import { ServerClient } from "postmark";
import type { MailAdapter, MailMessage } from "../mailer.js";

export class PostmarkMailAdapter implements MailAdapter {
  readonly vendor = "postmark" as const;
  private readonly client: ServerClient;

  constructor(
    private readonly from: string,
    token: string,
  ) {
    if (!token) throw new Error("PostmarkMailAdapter requires POSTMARK_TOKEN");
    this.client = new ServerClient(token);
  }

  async send(msg: MailMessage): Promise<void> {
    await this.client.sendEmail({
      From: this.from,
      To: msg.to,
      Subject: msg.subject,
      TextBody: msg.text,
      ...(msg.html ? { HtmlBody: msg.html } : {}),
      MessageStream: "outbound",
    });
  }
}
